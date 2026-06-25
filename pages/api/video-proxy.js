export const config = {
  runtime: 'edge',
};

const ALLOWED_CDN_DOMAINS = [
  'pacdn.aoneroom.com',
  'spedostream2.shop',
  'imb.hair',
  'netmirror.global',
  'netmirror.hair',
  'fmoviesunblocked.net',
  'via.placeholder.com',
  'hakunaymatata.com',
  'spedostream.com',
  'spedostream.shop',
  'spedostream2.com',
  'spedostream2.shop',
  'filesdl.top',
];

function isPrivateIp(ip) {
  // Check loopback, link-local, private IPv4 ranges, and IPv6 loopback
  if (
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip === '::1' ||
    ip === '[::1]' ||
    ip.startsWith('10.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('127.')
  ) {
    return true;
  }
  // 172.16.0.0 - 172.31.255.255
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }
  // 192.168.0.0 - 192.168.255.255
  if (ip.startsWith('192.168.')) {
    return true;
  }
  return false;
}

function isValidProxyUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname.toLowerCase();

    if (
      isPrivateIp(hostname) ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false;
    }

    // Allowlist check
    return ALLOWED_CDN_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch (e) {
    return false;
  }
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const streamUrl = searchParams.get('streamUrl');
    if (!streamUrl) {
      return new Response('streamUrl query parameter is required', { status: 400 });
    }

    if (!isValidProxyUrl(streamUrl)) {
      return new Response('Forbidden: Target URL is not allowed', { status: 403 });
    }

    const range = req.headers.get('range') || 'bytes=0-';
    let currentUrl = streamUrl;
    let redirectsFollowed = 0;
    const maxRedirects = 5;
    let response;

    while (redirectsFollowed < maxRedirects) {
      // Forward only safe headers (User-Agent and Range)
      const forwardHeaders = new Headers({
        'User-Agent': req.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': range,
        'Referer': 'https://fmoviesunblocked.net/',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
      });

      response = await fetch(currentUrl, {
        method: req.method || 'GET',
        headers: forwardHeaders,
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;

        // Resolve dynamic redirect location relative to current URL
        const nextUrl = new URL(location, currentUrl).toString();

        // Strictly validate redirect target
        if (!isValidProxyUrl(nextUrl)) {
          return new Response('Forbidden: Redirect target is not allowed', { status: 403 });
        }

        currentUrl = nextUrl;
        redirectsFollowed++;
      } else {
        break;
      }
    }

    if (!response.ok && response.status !== 206) {
      return new Response(null, { status: response.status || 404 });
    }

    // Detect if CDN returned HTML (download page) instead of a video stream (e.g. filesdl.top)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      // Only extract streamable formats (MP4/WebM) — MKV not playable in browser
      const mp4Match = html.match(/https:\/\/[^"'<>\s]+\.(mp4|webm)(\?[^"'<>\s]*)?/i);
      const streamableUrl = (mp4Match && mp4Match[0] &&
                             !mp4Match[0].toLowerCase().includes('.mkv') &&
                             !mp4Match[0].toLowerCase().includes('.avi'))
                            ? mp4Match[0] : null;

      if (streamableUrl) {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': streamableUrl,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        });
      }
      // MKV/download-only — return JSON so player can show download option
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

    const responseHeaders = new Headers({
      'Content-Type': response.headers.get('content-type') || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    });

    const contentRange = response.headers.get('content-range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);

    const contentLength = response.headers.get('content-length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response('Proxy Error', { status: 500 });
  }
}
