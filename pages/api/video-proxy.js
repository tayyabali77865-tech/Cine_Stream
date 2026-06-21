const { Readable } = require('stream');

export default async function handler(req, res) {
  try {
    const { streamUrl } = req.query;
    if (!streamUrl) {
      return res.status(400).send('streamUrl query parameter is required');
    }

    // Set Cache-Control to prevent Vercel CDN and browser caching of media streams
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

    let currentUrl = streamUrl;
    let redirectsFollowed = 0;
    const maxRedirects = 5;
    const redirectChain = [];
    let response;

    const range = req.headers.range || 'bytes=0-';

    while (redirectsFollowed < maxRedirects) {
      const urlObj = new URL(currentUrl);
      const headers = {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': range,
      };

      // Dynamically derive Referer and Origin from the stream source domain
      headers['Referer'] = urlObj.origin + '/';
      headers['Origin'] = urlObj.origin;

      console.log(`[Video Proxy Log] Hop ${redirectsFollowed + 1}: requesting ${currentUrl}`);

      response = await fetch(currentUrl, {
        method: req.method || 'GET',
        headers,
        redirect: 'manual'
      });

      console.log(`[Video Proxy Log] Hop ${redirectsFollowed + 1} status: ${response.status} ${response.statusText}`);

      // Dynamic fallback for hotlink-protected CDNs that reject derived referers
      if (response.status === 403) {
        console.log(`[Video Proxy Log] 403 Forbidden on derived referer. Retrying with fallback fmovies referer.`);
        headers['Referer'] = 'https://fmoviesunblocked.net/';
        delete headers['Origin'];
        response = await fetch(currentUrl, {
          method: req.method || 'GET',
          headers,
          redirect: 'manual'
        });
        console.log(`[Video Proxy Log] Retry status: ${response.status} ${response.statusText}`);
      }

      redirectChain.push({ url: currentUrl, status: response.status });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          console.error(`[Video Proxy Log] Redirect status ${response.status} but no Location header found.`);
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
      console.warn(`[Video Proxy Log] Fetch failed or returned HTML. Final URL: ${currentUrl}, Status: ${response.status}, Content-Type: ${contentType}`);
      res.setHeader('Content-Type', 'video/mp4');
      res.status(response.status || 404).end();
      return;
    }

    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie');

    if (setCookieHeaders) {
      res.setHeader('Set-Cookie', setCookieHeaders);
    }

    const headersToForward = {
      'Content-Type': contentType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    };

    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      headersToForward['Content-Range'] = contentRange;
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      headersToForward['Content-Length'] = contentLength;
    }

    res.writeHead(response.status, headersToForward);

    console.log(`[Video Proxy Log] Success. Final Resolved URL: ${currentUrl}`);
    console.log(`[Video Proxy Log] Redirect chain: ${JSON.stringify(redirectChain)}`);
    console.log(`[Video Proxy Log] Streaming response. Status: ${response.status}, Content-Range: ${contentRange || 'none'}`);

    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error('[Video Proxy Log] Error:', error.message);
    res.status(500).end();
  }
}
