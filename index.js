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

      while (redirectsFollowed < 5) {
        const fetchHeaders = new Headers({
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Range": rangeHeader,
          "Referer": "https://fmoviesunblocked.net/",
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        });

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
