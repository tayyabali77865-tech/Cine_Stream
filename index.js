export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const streamUrl = url.searchParams.get("streamUrl");
    const playerUrl = url.searchParams.get("playerUrl");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // --- CASE 1: Player HTML Proxy (spedostream2.shop player page) ---
    if (playerUrl) {
      const decodedPlayerUrl = decodeURIComponent(playerUrl);

      const headers = new Headers({
        "User-Agent": request.headers.get("user-agent") ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://netmirror.global/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      });

      // Forward cookies to retain session
      const cookie = request.headers.get("Cookie");
      if (cookie) headers.set("Cookie", cookie);

      try {
        const response = await fetch(decodedPlayerUrl, {
          headers,
          redirect: "follow",
        });

        const resHeaders = new Headers(response.headers);
        resHeaders.set("Access-Control-Allow-Origin", "*");

        return new Response(response.body, {
          status: response.status,
          headers: resHeaders,
        });
      } catch (err) {
        return new Response("Player Fetch Failed: " + err.message, { status: 502 });
      }
    }

    // --- CASE 2: Video Stream Proxy (Range-cached MP4 chunks) ---
    if (streamUrl) {
      const decodedStreamUrl = decodeURIComponent(streamUrl);
      const rangeHeader = request.headers.get("Range") || "bytes=0-";

      // Build a cache key unique per URL + Range
      const cacheKey = new Request(url.toString(), {
        headers: { "Range": rangeHeader },
      });
      const cache = caches.default;

      // 1. Check Cloudflare Edge cache first
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const headers = new Headers(cachedResponse.headers);
        headers.set("X-Proxy-Cache", "HIT");
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          headers,
        });
      }

      // 2. Cache MISS: fetch from CDN with required headers
      let currentUrl = decodedStreamUrl;
      let redirectsFollowed = 0;
      let response;

      const CDN_REFERER_MAP = [
        { pattern: 'hakunaymatata.com', referer: 'https://fmoviesunblocked.net/', origin: null },
        { pattern: 'megacloud',         referer: 'https://megacloud.club/', origin: 'https://megacloud.club' },
        { pattern: 'rapid-cloud',       referer: 'https://rapid-cloud.co/', origin: 'https://rapid-cloud.co' },
        { pattern: 'netmirror',         referer: 'https://netmirror.global/', origin: 'https://netmirror.global' },
      ];

      while (redirectsFollowed < 5) {
        let cdnReferer = "https://fmoviesunblocked.net/";
        let cdnOrigin = null;
        try {
          const hostname = new URL(currentUrl).hostname;
          for (const entry of CDN_REFERER_MAP) {
            if (hostname.includes(entry.pattern)) {
              cdnReferer = entry.referer;
              cdnOrigin = entry.origin;
              break;
            }
          }
        } catch (e) {}

        const fetchHeaders = new Headers({
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Range": rangeHeader,
          "Referer": cdnReferer,
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        });

        if (cdnOrigin) {
          fetchHeaders.set("Origin", cdnOrigin);
        }

        response = await fetch(currentUrl, {
          method: request.method,
          headers: fetchHeaders,
          redirect: "manual",
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) break;
          currentUrl = new URL(location, currentUrl).toString();
          redirectsFollowed++;
        } else {
          break;
        }
      }

      if (!response || (!response.ok && response.status !== 206)) {
        return new Response("Failed to fetch stream", {
          status: response?.status || 502,
        });
      }

      // 3. Detect if CDN returned an HTML page instead of video (e.g. filesdl.top download pages)
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        // Parse the HTML to extract a direct video/download URL
        const html = await response.text();
        
        // Priority 1: Cloudflare R2 direct link (r2.dev) with full query string
        const r2Match = html.match(/https:\/\/[^"'<>\s]+\.r2\.dev\/[^"'<>\s]+/);
        // Priority 2: Any direct mp4/webm URL (streamable)
        const mp4Match = html.match(/https:\/\/[^"'<>\s]+\.(mp4|webm)(\?[^"'<>\s]*)?/i);
        
        // Only use direct URL if it ends in a streamable format (MP4/WebM)
        // MKV/AVI etc. are NOT streamable in browsers — send user to download page instead
        const streamableUrl = (mp4Match && mp4Match[0] && 
                               !mp4Match[0].toLowerCase().includes('.mkv') &&
                               !mp4Match[0].toLowerCase().includes('.avi')) 
                              ? mp4Match[0] 
                              : null;
        
        if (streamableUrl) {
          // Redirect client to the direct streamable URL
          return new Response(null, {
            status: 302,
            headers: {
              "Location": streamableUrl,
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-store",
            },
          });
        }
        
        // No streamable URL found (MKV/download-only content)
        // Return JSON so the frontend can show a download page link
        return new Response(JSON.stringify({
          type: "download_only",
          message: "This content is download-only (MKV/non-streamable format)",
          download_page: decodedStreamUrl,
        }), {
          status: 422,
          headers: { 
            "Content-Type": "application/json", 
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          },
        });
      }

      // 3. Build response headers
      const responseHeaders = new Headers({
        "Content-Type": response.headers.get("content-type") || "video/mp4",
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "X-Proxy-Cache": "MISS",
        // Cache chunk on Cloudflare edge for 7 days
        "Cache-Control": "public, max-age=604800, s-maxage=604800",
      });

      const contentRange = response.headers.get("content-range");
      if (contentRange) responseHeaders.set("Content-Range", contentRange);

      const contentLength = response.headers.get("content-length");
      if (contentLength) responseHeaders.set("Content-Length", contentLength);

      const clientResponse = new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });

      // 4. Cache this chunk in background
      if (response.status === 200 || response.status === 206) {
        ctx.waitUntil(cache.put(cacheKey, clientResponse.clone()));
      }

      return clientResponse;
    }

    return new Response("Missing playerUrl or streamUrl parameter", { status: 400 });
  },
};
