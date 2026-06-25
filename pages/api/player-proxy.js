const crypto = require('crypto');

// Player domain fallbacks — tried in order when primary returns 404/5xx
const PLAYER_FALLBACK_DOMAINS = [
  'spedostream2.shop',
  'netmirror.global',
  'netmirror.hair',
  'imb.hair',
  'fmoviesunblocked.net',
];

function buildFallbackUrl(originalUrl, newDomain) {
  try {
    const u = new URL(originalUrl);
    u.hostname = newDomain;
    return u.toString();
  } catch {
    return null;
  }
}

function errorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Video Unavailable</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0b0f19;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Inter,sans-serif}
  .box{text-align:center;padding:40px 32px;max-width:420px}
  .icon{font-size:56px;margin-bottom:16px}
  h2{color:#fff;font-size:22px;font-weight:700;margin-bottom:10px}
  p{color:#94a3b8;font-size:14px;line-height:1.7}
  .code{display:inline-block;margin-top:16px;padding:4px 12px;background:#1e293b;border-radius:6px;color:#f87171;font-size:12px;font-family:monospace}
</style>
</head>
<body>
  <div class="box">
    <div class="icon">&#127916;</div>
    <h2>Video Unavailable</h2>
    <p>This video could not be loaded from any server. The file may have been removed from the CDN. Try another server button above.</p>
    <span class="code">${message}</span>
  </div>
</body>
</html>`;
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
    console.log("ORIGINAL URL:", url);
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

    let workerUrl = process.env.CLOUDFLARE_WORKER_URL;
    if (workerUrl && !workerUrl.startsWith('http://') && !workerUrl.startsWith('https://')) {
      workerUrl = `https://${workerUrl}`;
    }

    console.log("FINAL TARGET URL:", targetUrl);

    // --- Multi-domain fallback chain ---
    // If primary domain 404s, automatically try each fallback domain with the same path/query
    let response = null;
    let successUrl = null;

    for (const domain of PLAYER_FALLBACK_DOMAINS) {
      const candidateUrl = buildFallbackUrl(targetUrl, domain);
      if (!candidateUrl) continue;

      const fetchUrl = workerUrl
        ? `${workerUrl}?playerUrl=${encodeURIComponent(candidateUrl)}`
        : candidateUrl;

      try {
        const r = await fetch(fetchUrl, { headers });
        if (r.ok) {
          response = r;
          successUrl = candidateUrl;
          console.log(`[player-proxy] Success via domain: ${domain}`);
          break;
        } else {
          console.warn(`[player-proxy] ${domain} returned ${r.status}, trying next...`);
        }
      } catch (err) {
        console.warn(`[player-proxy] ${domain} network error: ${err.message}, trying next...`);
      }
    }

    if (!response || !response.ok) {
      // All fallbacks exhausted — show styled error page (no raw HTML dump)
      console.error('[player-proxy] All fallback domains failed for:', targetUrl);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(errorPage('All CDN servers returned 404'));
    }

    // Forward Set-Cookie headers from target server to client browser
    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie');

    if (setCookieHeaders) {
      res.setHeader('Set-Cookie', setCookieHeaders);
    }

    let html = await response.text();

    // Strip any Content-Security-Policy meta tags returned by the remote server
    html = html.replace(/<meta[^>]*content-security-policy[^>]*>/gi, '');

    // Get local origin to build absolute URLs that bypass base-href resolution
    const host = req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const localOrigin = `${proto}://${host}`;

    // --- Asset URL rewriting for CORS ---
    // When falling back to a different domain (e.g. netmirror.global), that domain's player
    // uses Vite-built type="module" scripts. Module scripts ALWAYS require CORS headers.
    // The fallback domain does NOT send CORS headers.
    // Solution: route all asset URLs through /api/asset-proxy which fetches the actual
    // asset and adds Access-Control-Allow-Origin: * headers.
    const parsedOriginal = new URL(url);
    const originalOrigin = parsedOriginal.protocol + '//' + parsedOriginal.host;

    let assetOrigin = originalOrigin;
    let baseHref = originalOrigin + '/play/';

    if (successUrl) {
      const parsedSuccess = new URL(successUrl);
      const fallbackOrigin = parsedSuccess.protocol + '//' + parsedSuccess.host;

      if (fallbackOrigin !== originalOrigin) {
        // Use fallback domain as the asset source and base href
        assetOrigin = fallbackOrigin;
        baseHref = fallbackOrigin + '/play/';

        // Step 1: Rewrite absolute fallback-domain asset URLs to go via asset-proxy
        // e.g. https://netmirror.global/assets/index.js -> /api/asset-proxy?url=...
        const escapedFallback = fallbackOrigin.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(
          new RegExp(escapedFallback + '(/[^"\'\\s<>]+)', 'g'),
          function(match, path) {
            return localOrigin + '/api/asset-proxy?url=' + encodeURIComponent(fallbackOrigin + path);
          }
        );

        // Step 2: Rewrite relative /assets/, /js/, /css/, /dist/ paths in src/href attributes
        // e.g. src="/assets/index.js" -> src="/api/asset-proxy?url=https://netmirror.global/assets/index.js"
        html = html.replace(
          /((?:src|href)=["'])(\/(?:assets|js|css|dist)\/[^"']+)(["'])/g,
          function(match, before, path, after) {
            return before + localOrigin + '/api/asset-proxy?url=' + encodeURIComponent(assetOrigin + path) + after;
          }
        );

        console.log('[player-proxy] Asset proxy: routing ' + fallbackOrigin + ' assets via ' + localOrigin + '/api/asset-proxy');
      }
    }

    // Inject AdBlock bypass script and base tag
    const adblockBypassScript = `
      <script>
        window.adblock = false;
        window.adblock3 = false;
        window.canRunAds = true;
        window.adblockDetected = false;
        window.checkAdBlock = function() { return false; };

        // Dynamic extension detection (with repeated checks to avoid race conditions)
        window.hasExtensionActive = false;
        window.addEventListener("message", (event) => {
          if (event.data?.type === "NETMIRROR_EXTENSION_DETECTED") {
            window.hasExtensionActive = true;
            console.log("CineStream: Extension detected, bypassing proxy.");
          }
        });
        
        let checkCount = 0;
        const checkInterval = setInterval(() => {
          if (window.hasExtensionActive || checkCount > 15) {
            clearInterval(checkInterval);
            return;
          }
          window.postMessage({ type: "NETMIRROR_CHECK" }, "*");
          checkCount++;
        }, 50);

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

    // Strip ad/tracking scripts
    html = html.replace(/<script[^>]*llvpn\.com[^>]*>([\s\S]*?)<\/script>/gi, '');
    html = html.replace(/<script[^>]*tag\.min\.js[^>]*>([\s\S]*?)<\/script>/gi, '');
    html = html.replace(/https?:\/\/llvpn\.com[^\s'"`]*/gi, `${localOrigin}/api/dummy.js`);
    html = html.replace(/https?:\/\/adblock\.com[^\s'"`]*/gi, '/');
    html = html.replace(/console\.log\(['"]AdBlock detected['"]\)/gi, 'console.log("AdBlock bypassed")');

    // Route video stream through our Vercel Edge video-proxy
    // (Cloudflare Worker IPs are blocked by hakunaymatata.com CDN)
    const videoProxyUrl = `${localOrigin}/api/video-proxy`;
    html = html.replace('function play_url(play_url,ext=0){', `function play_url(play_url,ext=0){ 
      if (window.hasExtensionActive) {
        return play_url;
      }
      return "${videoProxyUrl}?streamUrl=" + encodeURIComponent(play_url); `);

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
        .art-icon-state {
            width: 55px !important;
            height: 55px !important;
        }
        .art-icon-state svg {
            width: 100% !important;
            height: 100% !important;
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
}
