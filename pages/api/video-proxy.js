export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const streamUrl = searchParams.get('streamUrl');
    if (!streamUrl) {
      return new Response('streamUrl query parameter is required', { status: 400 });
    }

    const range = req.headers.get('range') || 'bytes=0-';
    let currentUrl = streamUrl;
    let redirectsFollowed = 0;
    const maxRedirects = 5;
    let response;

    while (redirectsFollowed < maxRedirects) {
      const urlObj = new URL(currentUrl);
      
      // Advanced browser headers mimicry to bypass standard filters
      const headers = new Headers({
        'User-Agent': req.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': range,
        'Referer': 'https://fmoviesunblocked.net/',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      });

      response = await fetch(currentUrl, {
        method: req.method || 'GET',
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
      return new Response(null, { status: response.status || 404 });
    }

    const responseHeaders = new Headers({
      'Content-Type': response.headers.get('content-type') || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
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
    return new Response('Proxy Error', { status: 500 });
  }
}
