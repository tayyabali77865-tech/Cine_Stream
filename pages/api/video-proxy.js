const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

let cachedProxies = [];
let lastFetchedTime = 0;

async function getProxiesList() {
  const now = Date.now();
  // Fetch every 5 minutes
  if (cachedProxies.length === 0 || (now - lastFetchedTime) > 5 * 60 * 1000) {
    try {
      const res = await fetch('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=3000&country=all&ssl=all&anonymity=anonymous');
      if (res.ok) {
        const text = await res.text();
        const list = text.split('\r\n').map(p => p.trim()).filter(Boolean);
        if (list.length > 0) {
          cachedProxies = list;
          lastFetchedTime = now;
          console.log(`[Proxy Rotator] Refreshed proxy cache. Total proxies: ${list.length}`);
        }
      }
    } catch (err) {
      console.error('[Proxy Rotator] Failed to fetch proxy list:', err.message);
    }
  }
  return cachedProxies;
}

export default async function handler(req, res) {
  try {
    const { streamUrl } = req.query;
    if (!streamUrl) {
      return res.status(400).send('streamUrl query parameter is required');
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

    const range = req.headers.range || 'bytes=0-';
    let currentUrl = streamUrl;
    let redirectsFollowed = 0;
    const maxRedirects = 5;
    let response;

    const proxyList = await getProxiesList();

    while (redirectsFollowed < maxRedirects) {
      const urlObj = new URL(currentUrl);
      const headers = {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': range,
        'Referer': 'https://fmoviesunblocked.net/',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      };

      let success = false;
      let lastErr = null;

      // Try up to 4 proxies from the pool
      const testedProxies = [];
      const shuffleList = [...proxyList].sort(() => 0.5 - Math.random());

      for (let i = 0; i < Math.min(4, shuffleList.length); i++) {
        const proxy = shuffleList[i];
        testedProxies.push(proxy);
        const agent = new HttpsProxyAgent(`http://${proxy}`);

        try {
          response = await fetch(currentUrl, {
            method: req.method || 'GET',
            headers,
            agent,
            redirect: 'manual',
            timeout: 4000 // 4s timeout per proxy request
          });

          if (response.status === 206 || response.status === 200 || (response.status >= 300 && response.status < 400)) {
            success = true;
            break;
          } else {
            console.warn(`[Proxy Rotator] Proxy ${proxy} returned status ${response.status} for ${currentUrl}`);
          }
        } catch (err) {
          lastErr = err;
        }
      }

      // If all proxy attempts failed, try a direct fetch as fallback
      if (!success) {
        console.warn(`[Proxy Rotator] All proxies failed. Tried: ${testedProxies.join(', ')}. Falling back to direct fetch.`);
        try {
          response = await fetch(currentUrl, {
            method: req.method || 'GET',
            headers,
            redirect: 'manual',
            timeout: 6000
          });
        } catch (err) {
          return res.status(500).send(`Proxy Error: ${err.message || lastErr?.message}`);
        }
      }

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
      return res.status(response.status).send(`Proxy Error Status: ${response.status}`);
    }

    // Set response headers
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

    const contentRange = response.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const contentLength = response.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    res.status(response.status);

    response.body.pipe(res);

  } catch (error) {
    console.error('[Video Proxy Log] Server error:', error.message);
    res.status(500).send(`Proxy Server Error: ${error.message}`);
  }
}
