import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

let cachedProxies = [];
let lastFetchedTime = 0;

async function getProxiesList() {
  const now = Date.now();
  // Fetch every 5 minutes
  if (cachedProxies.length === 0 || (now - lastFetchedTime) > 5 * 60 * 1000) {
    try {
      const res = await fetch('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=1500&country=all&ssl=all&anonymity=anonymous');
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
    let isDirectSuccess = false;

    while (redirectsFollowed < maxRedirects) {
      const headers = {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': range,
        'Referer': 'https://fmoviesunblocked.net/',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      };

      // 1. Try direct high-speed fetch first (skip for known blocked domains like hakunaymatata.com)
      const isBlockedDomain = currentUrl.includes('hakunaymatata.com');
      if (!isBlockedDomain) {
        try {
          console.log(`[Video Proxy] Attempting direct fetch for: ${currentUrl}`);
          response = await fetch(currentUrl, {
            method: 'GET',
            headers,
            redirect: 'manual',
            timeout: 2500 // 2.5 seconds timeout for direct fetch
          });

          if (response.status === 206 || response.status === 200 || (response.status >= 300 && response.status < 400)) {
            isDirectSuccess = true;
            console.log(`[Video Proxy] Direct fetch succeeded with status ${response.status}`);
          } else {
            console.warn(`[Video Proxy] Direct fetch returned status ${response.status}`);
          }
        } catch (err) {
          console.warn(`[Video Proxy] Direct fetch failed/timed out: ${err.message}`);
        }
      } else {
        console.log(`[Video Proxy] Skipping direct fetch for known blocked domain: ${urlObj.hostname}`);
      }

      // 2. Fallback to public proxy rotation if direct fetch failed
      if (!isDirectSuccess) {
        console.log(`[Video Proxy] Direct fetch failed or blocked. Falling back to public proxy rotation.`);
        const proxyList = await getProxiesList();
        let success = false;

        const shuffleList = [...proxyList].sort(() => 0.5 - Math.random());
        for (let i = 0; i < Math.min(3, shuffleList.length); i++) {
          const proxy = shuffleList[i];
          const agent = new HttpsProxyAgent(`http://${proxy}`);

          try {
            console.log(`[Video Proxy] Attempting proxy fetch via: ${proxy}`);
            response = await fetch(currentUrl, {
              method: 'GET',
              headers,
              agent,
              redirect: 'manual',
              timeout: 2000 // 2 seconds timeout per proxy request
            });

            if (response.status === 206 || response.status === 200 || (response.status >= 300 && response.status < 400)) {
              success = true;
              console.log(`[Video Proxy] Proxy ${proxy} fetch succeeded with status ${response.status}`);
              break;
            } else {
              console.warn(`[Video Proxy] Proxy ${proxy} returned status ${response.status}`);
            }
          } catch (err) {
            console.warn(`[Video Proxy] Proxy ${proxy} request failed:`, err.message);
          }
        }

        // Ultimate fallback: direct fetch without strict timeout limits if proxies also failed
        if (!success) {
          console.warn(`[Video Proxy] All proxies failed. Retrying direct fetch without strict timeout.`);
          try {
            response = await fetch(currentUrl, {
              method: 'GET',
              headers,
              redirect: 'manual',
              timeout: 6000
            });
          } catch (err) {
            return res.status(500).send(`Proxy Error: ${err.message}`);
          }
        }
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        currentUrl = new URL(location, currentUrl).toString();
        redirectsFollowed++;
        // Reset success flag for next redirect hop
        isDirectSuccess = false;
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
