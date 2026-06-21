const crypto = require('crypto');

async function fetchWithRetry(url, options = {}, retries = 3, delay = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send('URL query parameter is required');
    }

    // Set Cache-Control to prevent Vercel CDN and browser caching of signed pages
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

    // Regenerate signature dynamically to prevent "Time not Found" / expiration issues
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', 'net###@@sss').update(String(ts)).digest('hex');

    let targetUrl = url;
    if (targetUrl.includes('ts=')) {
      targetUrl = targetUrl.replace(/ts=\d+/g, `ts=${ts}`);
    } else {
      targetUrl += `&ts=${ts}`;
    }

    if (targetUrl.includes('sig=')) {
      targetUrl = targetUrl.replace(/sig=[a-f0-9]+/g, `sig=${sig}`);
    } else {
      targetUrl += `&sig=${sig}`;
    }

    const headers = {
      'Referer': 'https://netmirror.global/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (req.headers.cookie) {
      headers['Cookie'] = req.headers.cookie;
    }

    const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
    const fetchUrl = workerUrl ? `${workerUrl}?playerUrl=${encodeURIComponent(targetUrl)}` : targetUrl;
    const response = await fetchWithRetry(fetchUrl, { headers });

    if (!response.ok) {
      return res.status(response.status).send(`Proxy error: ${response.statusText}`);
    }

    // Forward Set-Cookie headers from target server to client browser to propagate the session
    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie');

    if (setCookieHeaders) {
      res.setHeader('Set-Cookie', setCookieHeaders);
    }

    let html = await response.text();

    // Strip any Content-Security-Policy meta tags returned by the remote server (broad, case-insensitive match)
    html = html.replace(/<meta[^>]*content-security-policy[^>]*>/gi, '');

    // Get local origin to build absolute URLs that bypass base-href resolution
    const host = req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const localOrigin = `${proto}://${host}`;

    // Inject AdBlock bypass script and base tag
    const parsedUrl = new URL(url);
    const baseHref = `${parsedUrl.protocol}//${parsedUrl.host}/play/`;
    const adblockBypassScript = `
      <script>
        window.adblock = false;
        window.adblock3 = false;
        window.canRunAds = true;
        window.adblockDetected = false;
        window.checkAdBlock = function() { return false; };

        // Force no-referrer referrerpolicy on video elements to bypass CDN hotlink protections
        document.addEventListener('DOMContentLoaded', () => {
          const observer = new MutationObserver((mutations) => {
            const video = document.querySelector('video');
            if (video) {
              video.setAttribute('referrerpolicy', 'no-referrer');
              video.removeAttribute('crossorigin');
              console.log('Applied no-referrer to video element successfully');
              observer.disconnect();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        });
      </script>
    `;
    html = html.replace(/<head>/i, `<head>${adblockBypassScript}<base href="${baseHref}">`);

    // Force extension status to true
    html = html.replace(/params\.get\(['"]exten['"]\)/g, '"true"');

    // Strip ad/tracking scripts to prevent CSP violations and tracking
    html = html.replace(/<script[^>]*llvpn\.com[^>]*>([\s\S]*?)<\/script>/gi, '');
    html = html.replace(/<script[^>]*tag\.min\.js[^>]*>([\s\S]*?)<\/script>/gi, '');
    html = html.replace(/https?:\/\/llvpn\.com[^\s'"`]*/gi, `${localOrigin}/api/dummy.js`);

    // Bypass adblock.com detection request by replacing it with a local path (succeeds under 'self' CSP)
    html = html.replace(/https?:\/\/adblock\.com[^\s'"`]*/gi, '/');
    html = html.replace(/console\.log\(['"]AdBlock detected['"]\)/gi, 'console.log("AdBlock bypassed")');

    const proxyUrl = process.env.CLOUDFLARE_WORKER_URL || `${localOrigin}/api/video-proxy`;
    html = html.replace('function play_url(play_url,ext=0){', `function play_url(play_url,ext=0){ 
      return "${proxyUrl}?streamUrl=" + encodeURIComponent(play_url); `);

    const extraStyles = `
      <style>
        html,
        body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
        }
        .popup-window-ext, .if_ext, .server {
          display: none !important;
        }
        .artplayer-app,
        .art-video-player,
        .art-video {
            width: 100vw !important;
            height: 100vh !important;
            min-height: 100vh !important;
            max-height: 100vh !important;
            overflow: hidden !important;
        }
        @media only screen and (max-width: 768px) {
            .artplayer-app,
            .art-video-player,
            .art-video {
                height: 100dvh !important;
            }
            .art-video {
                object-fit: fill !important;
            }
        }
        .art-video-player {
            display: flex !important;
            flex-direction: column !important;
        }
        .art-video {
            flex: 1 !important;
            min-height: 0 !important;
            height: 100% !important;
        }
        .art-bottom {
            padding-bottom: 0 !important;
            margin-bottom: 0 !important;
            height: auto !important;
            overflow: hidden !important;
        }
      </style>
    `;
    html = html.replace('</head>', `${extraStyles}</head>`);

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Proxy request failed:', error.message);
    return res.status(500).send(`Proxy error: ${error.message}`);
  }
};
