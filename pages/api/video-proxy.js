export const config = {
  runtime: 'edge',
};

// CDN hostname → trusted Referer/Origin map
const CDN_REFERER_MAP = [
  { pattern: 'hakunaymatata.com', referer: 'https://megacloud.club/', origin: 'https://megacloud.club' },
  { pattern: 'megacloud',         referer: 'https://megacloud.club/', origin: 'https://megacloud.club' },
  { pattern: 'rapid-cloud',       referer: 'https://rapid-cloud.co/', origin: 'https://rapid-cloud.co' },
  { pattern: 'netmirror',         referer: 'https://netmirror.global/', origin: 'https://netmirror.global' },
];

function getRefererForUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    for (const entry of CDN_REFERER_MAP) {
      if (hostname.includes(entry.pattern)) {
        return { referer: entry.referer, origin: entry.origin };
      }
    }
  } catch {}
  return { referer: 'https://fmoviesunblocked.net/', origin: null };
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const streamUrl = searchParams.get('streamUrl');
    if (!streamUrl) {
      return new Response('streamUrl query parameter is required', { status: 400 });
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
        },
      });
    }

    const range = req.headers.get('range') || 'bytes=0-';
    let currentUrl = streamUrl;
    let redirectsFollowed = 0;
    const maxRedirects = 5;
    let response;

    while (redirectsFollowed < maxRedirects) {
      const { referer, origin } = getRefererForUrl(currentUrl);

      const headers = new Headers({
        'User-Agent': req.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Range': range,
        'Referer': referer,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      });

      if (origin) headers.set('Origin', origin);

      response = await fetch(currentUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        currentUrl = new URL(location, currentUrl).toString();
        redirectsFollowed++;
      } else {
        break;
      }
    }

    if (!response.ok) {
      return new Response(`Upstream error: ${response.status} ${response.statusText}`, {
        status: response.status || 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const responseHeaders = new Headers({
      'Content-Type': response.headers.get('content-type') || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
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
    return new Response(`Proxy Error: ${error.message}`, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}
