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

    // Set Cache-Control to prevent CDN and browser caching of media streams
    const responseHeaders = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    });

    let currentUrl = streamUrl;
    let redirectsFollowed = 0;
    const maxRedirects = 5;
    const redirectChain = [];
    let response;

    const range = req.headers.get('range') || 'bytes=0-';

    while (redirectsFollowed < maxRedirects) {
      const urlObj = new URL(currentUrl);
      const headers = new Headers({
        'User-Agent': req.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': range,
        'Referer': urlObj.origin + '/',
        'Origin': urlObj.origin,
      });

      console.log(`[Video Proxy Edge] Hop ${redirectsFollowed + 1}: requesting ${currentUrl}`);

      response = await fetch(currentUrl, {
        method: req.method || 'GET',
        headers,
        redirect: 'manual',
      });

      console.log(`[Video Proxy Edge] Hop ${redirectsFollowed + 1} status: ${response.status} ${response.statusText}`);

      // Dynamic fallback for hotlink-protected CDNs that reject derived referers
      if (response.status === 403) {
        console.log(`[Video Proxy Edge] 403 Forbidden on derived referer. Retrying with fallback fmovies referer.`);
        headers.set('Referer', 'https://fmoviesunblocked.net/');
        headers.delete('Origin');
        response = await fetch(currentUrl, {
          method: req.method || 'GET',
          headers,
          redirect: 'manual',
        });
        console.log(`[Video Proxy Edge] Retry status: ${response.status} ${response.statusText}`);
      }

      redirectChain.push({ url: currentUrl, status: response.status });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          console.error(`[Video Proxy Edge] Redirect status ${response.status} but no Location header found.`);
          break;
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirectsFollowed++;
      } else {
        break;
      }
    }

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('text/html')) {
      console.warn(`[Video Proxy Edge] Fetch failed or returned HTML. Final URL: ${currentUrl}, Status: ${response.status}, Content-Type: ${contentType}`);
      return new Response(null, {
        status: response.status || 404,
        headers: {
          'Content-Type': 'video/mp4',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    responseHeaders.set('Content-Type', contentType || 'video/mp4');
    responseHeaders.set('Accept-Ranges', 'bytes');

    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    const setCookieHeaders = response.headers.getSetCookie 
      ? response.headers.getSetCookie() 
      : response.headers.get('set-cookie');

    if (setCookieHeaders) {
      if (Array.isArray(setCookieHeaders)) {
        setCookieHeaders.forEach(cookie => responseHeaders.append('Set-Cookie', cookie));
      } else {
        responseHeaders.set('Set-Cookie', setCookieHeaders);
      }
    }

    console.log(`[Video Proxy Edge] Success. Final Resolved URL: ${currentUrl}`);
    console.log(`[Video Proxy Edge] Redirect chain: ${JSON.stringify(redirectChain)}`);

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[Video Proxy Edge] Error:', error.message);
    return new Response('Internal Server Error', { status: 500 });
  }
}
