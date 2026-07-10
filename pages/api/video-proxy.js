export const config = {
  runtime: 'edge',
};

const ALLOWED_CDN_DOMAINS = [
  'pacdn.aoneroom.com',
  'pbcdnw.aoneroom.com',
  'spedostream2.shop',
  'imb.hair',
  'imb.lat',
  'netmirror.global',
  'netmirror.hair',
  'fmoviesunblocked.net',
  'hakunaymatata.com',
  'bcdnxw.hakunaymatata.com',
  'spedostream.com',
  'spedostream.shop',
  'spedostream2.com',
  'filesdl.top',
  'aoneroom.com',
];

function isPrivateIp(ip) {
  if (
    ip === '127.0.0.1' || ip === 'localhost' || ip === '::1' || ip === '[::1]' ||
    ip.startsWith('10.') || ip.startsWith('169.254.') || ip.startsWith('127.')
  ) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return ip.startsWith('192.168.');
}

function isValidProxyUrl(targetUrl) {
  try {
    const { hostname } = new URL(targetUrl);
    const h = hostname.toLowerCase();
    if (isPrivateIp(h) || h.endsWith('.local') || h.endsWith('.internal')) return false;
    return ALLOWED_CDN_DOMAINS.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const streamUrl = searchParams.get('streamUrl');

    if (!streamUrl) {
      return new Response('streamUrl parameter is required', { status: 400 });
    }
    if (!isValidProxyUrl(streamUrl)) {
      return new Response('Forbidden', { status: 403 });
    }

    // ── hakunaymatata.com: skip HEAD, directly 302 redirect to CDN ───────────
    // hakunaymatata.com blocks Cloudflare/server IPs on HEAD/GET but NOT browser IPs.
    // So just send the browser directly — it will work fine.
    const streamHost = new URL(streamUrl).hostname.toLowerCase();
    if (streamHost.includes('hakunaymatata.com')) {
      console.log('[video-proxy] hakunaymatata → direct 302 redirect to browser');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': streamUrl,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    // ── Resolve redirects server-side (HEAD request to follow hops) ──────────
    // Then send a 302 to the FINAL resolved URL so the browser fetches
    // video bytes directly from CDN — zero server bandwidth.
    let currentUrl = streamUrl;
    const maxRedirects = 6;
    let redirectsFollowed = 0;

    while (redirectsFollowed < maxRedirects) {
      const headRes = await fetch(currentUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://netmirror.global/',
          'Accept': '*/*',
        },
        redirect: 'manual',
      });

      if (headRes.status >= 300 && headRes.status < 400) {
        const location = headRes.headers.get('location');
        if (!location) break;
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isValidProxyUrl(nextUrl)) break; // Stop if redirect goes to unknown domain
        currentUrl = nextUrl;
        redirectsFollowed++;
        continue;
      }

      // Check if CDN returned HTML instead of video (e.g. filesdl.top download page)
      const ct = headRes.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        // Fall through to GET-based HTML extraction below
        break;
      }

      // Final URL resolved — redirect browser directly to CDN
      console.log(`[video-proxy] 302 redirect to CDN (${redirectsFollowed} hops): ${currentUrl}`);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': currentUrl,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    // ── Fallback: GET request for HTML-based download pages (filesdl.top etc.) ──
    const getRes = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://netmirror.global/',
        'Accept': '*/*',
      },
      redirect: 'follow',
    });

    const contentType = getRes.headers.get('content-type') || '';

    // If it's an HTML page, try to extract embedded MP4 URL and redirect to it
    if (contentType.includes('text/html')) {
      const html = await getRes.text();
      const mp4Match = html.match(/https:\/\/[^"'<>\s]+\.(mp4|webm)(\?[^"'<>\s]*)?/i);
      const streamableUrl = mp4Match && mp4Match[0] ? mp4Match[0] : null;

      if (streamableUrl && isValidProxyUrl(streamableUrl)) {
        console.log(`[video-proxy] Extracted MP4 from HTML page, redirecting: ${streamableUrl}`);
        return new Response(null, {
          status: 302,
          headers: {
            'Location': streamableUrl,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        });
      }

      // Download-only content (MKV etc.)
      return new Response(JSON.stringify({
        type: 'download_only',
        message: 'This content is download-only (MKV/non-streamable format)',
        download_page: streamUrl,
      }), {
        status: 422,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    // If GET response is a direct video stream, redirect to final URL
    const finalUrl = getRes.url || currentUrl;
    console.log(`[video-proxy] GET resolved, redirecting to: ${finalUrl}`);
    return new Response(null, {
      status: 302,
      headers: {
        'Location': finalUrl,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[video-proxy] Error:', error.message);
    return new Response('Proxy Error', { status: 500 });
  }
}
