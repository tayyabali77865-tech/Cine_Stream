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

    // ── Rotating Proxy Chain ──────────────────────────────────────────────
    // Tries each approach in order; uses first successful HTML response.
    // All free, all within Vercel — no extra hosting or credit card needed.
    const PROXY_CHAIN = [
      // 1. Primary: HF Space / Cloudflare Worker (fastest when alive)
      async () => {
        const workerUrl = process.env.CLOUDFLARE_WORKER_URL || 'https://cine-stream-proxy.tayyabali77865.workers.dev/';
        const fetchUrl = `${workerUrl}?playerUrl=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent('https://netmirror.global/')}`;
        const r = await fetch(fetchUrl, { headers, signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Worker ${r.status}`);
        return r;
      },
      // 2. Direct fetch from Vercel Edge to player server
      async () => {
        const r = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(5000), redirect: 'follow' });
        if (!r.ok) throw new Error(`Direct ${r.status}`);
        const text = await r.text();
        if (text.includes('Server Buzy') || text.length < 500) throw new Error('Direct: server busy or empty');
        return new Response(text, { status: 200, headers: r.headers });
      },
      // 3. corsproxy.io — free public CORS proxy
      async () => {
        const r = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, {
          headers: { 'User-Agent': headers['User-Agent'] },
          signal: AbortSignal.timeout(6000)
        });
        if (!r.ok) throw new Error(`corsproxy.io ${r.status}`);
        return r;
      },
      // 4. allorigins.win — another free CORS proxy
      async () => {
        const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, {
          signal: AbortSignal.timeout(6000)
        });
        if (!r.ok) throw new Error(`allorigins ${r.status}`);
        return r;
      },
      // 5. codetabs.com proxy — last resort free option
      async () => {
        const r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, {
          signal: AbortSignal.timeout(7000)
        });
        if (!r.ok) throw new Error(`codetabs ${r.status}`);
        return r;
      },
    ];

    let response = null;
    let lastError = '';
    for (const tryProxy of PROXY_CHAIN) {
      try {
        response = await tryProxy();
        console.log('[Proxy Rotation] Success with proxy attempt.');
        break;
      } catch (err) {
        lastError = err.message;
        console.warn('[Proxy Rotation] Attempt failed:', err.message, '— trying next...');
      }
    }

    if (!response) {
      return res.status(502).send(`All proxies failed. Last error: ${lastError}`);
    }

    // Forward Set-Cookie headers from target server to client browser
    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie');
    if (setCookieHeaders) {
      res.setHeader('Set-Cookie', setCookieHeaders);
    }

    let html = await response.text();

    if (html.includes('Server Buzy.Re try') || html.includes('Server Buzy')) {
      const host = req.headers.host || 'localhost:3000';
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const localOrigin = `${proto}://${host}`;
      const targetBase = new URL(url).origin;

      html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Loading...</title>
        <script>
          window.hasExtensionActive = false;
          window.addEventListener("message", (event) => {
            if (event.data?.type === "NETMIRROR_EXTENSION_DETECTED") {
              window.hasExtensionActive = true;
              console.log("Extension detected on Server Busy fallback, redirecting directly.");
              window.location.href = decodeURIComponent("${encodeURIComponent(targetUrl)}");
            }
          });

          // Check for extension
          let checkCount = 0;
          const checkInterval = setInterval(() => {
            if (window.hasExtensionActive) {
              clearInterval(checkInterval);
              return;
            }
            if (checkCount > 40) {
              clearInterval(checkInterval);
              // Fallback: show retry alert or reload after a short delay
              document.getElementById('status-msg').innerHTML = "Server is currently busy. Retrying automatically in 3 seconds...<br><span style='font-size:12px;color:#888;'>Tip: Install the NetMirror Extension for instant bypass.</span>";
              setTimeout(() => {
                window.location.reload();
              }, 3000);
              return;
            }
            window.postMessage({ type: "NETMIRROR_CHECK" }, "*");
            checkCount++;
          }, 50);
        </script>
        <style>
          body {
            background: #000;
            color: #fff;
            font-family: sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .spinner {
            border: 4px solid rgba(255,255,255,0.1);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border-left-color: #09d;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
            display: inline-block;
          }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div>
          <div class="spinner"></div>
          <div id="status-msg">Connecting to secure stream...</div>
        </div>
      </body>
      </html>
      `;
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    }

    // Strip any Content-Security-Policy meta tags returned by the remote server (broad, case-insensitive match)
    html = html.replace(/<meta[^>]*content-security-policy[^>]*>/gi, '');

    // Get local origin to build absolute URLs that bypass base-href resolution
    const host = req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const localOrigin = `${proto}://${host}`;

    // Inject comprehensive extension bypass + AdBlock bypass + base tag
    const parsedUrl = new URL(url);
    const baseHref = `${parsedUrl.protocol}//${parsedUrl.host}/play/`;
    const adblockBypassScript = `
      <script>
        /* ===== CineStream: Full Extension Bypass ===== */

        // 1. Immediately signal extension is active — must be BEFORE any player JS runs
        window.hasExtensionActive = true;

        // 2. Fake chrome.runtime so player extension checks pass
        if (!window.chrome) window.chrome = {};
        if (!window.chrome.runtime) {
          window.chrome.runtime = {
            sendMessage: function(msg, cb) { if (cb) cb({ status: 'ok', extension: true }); },
            onMessage: { addListener: function() {} },
            id: 'fakeextensionid123456789'
          };
        }

        // 3. Spoof window.postMessage so NETMIRROR_CHECK always gets a positive reply
        const _origPostMessage = window.postMessage.bind(window);
        window.postMessage = function(data, origin) {
          _origPostMessage(data, origin || '*');
          if (data && data.type === 'NETMIRROR_CHECK') {
            _origPostMessage({ type: 'NETMIRROR_EXTENSION_DETECTED' }, '*');
          }
        };

        // 4. Keep replying to any future extension detection messages
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'NETMIRROR_CHECK') {
            window.postMessage({ type: 'NETMIRROR_EXTENSION_DETECTED' }, '*');
          }
        });

        // 5. Adblock bypass
        window.adblock = false;
        window.adblock3 = false;
        window.canRunAds = true;
        window.adblockDetected = false;
        window.checkAdBlock = function() { return false; };

        // 6. Patch video elements to no-referrer so IP-bound CDN tokens work directly
        function patchVideoElements() {
          document.querySelectorAll('video, source').forEach(el => {
            el.setAttribute('referrerpolicy', 'no-referrer');
            el.removeAttribute('crossorigin');
          });
        }
        patchVideoElements();
        const videoObserver = new MutationObserver(patchVideoElements);
        if (document.body) {
          videoObserver.observe(document.body, { childList: true, subtree: true });
        } else {
          document.addEventListener('DOMContentLoaded', () => {
            patchVideoElements();
            videoObserver.observe(document.body, { childList: true, subtree: true });
          });
        }
      </script>
    `;
    html = html.replace(/(<head>)/i, `$1${adblockBypassScript}<base href="${baseHref}">`);

    // Force extension status to true
    html = html.replace(/params\.get\(['"]exten['"]\)/g, '"true"');

    // Strip ad/tracking scripts to prevent CSP violations and tracking
    html = html.replace(/<script[^>]*llvpn\.com[^>]*>([\s\S]*?)<\/script>/gi, '');
    html = html.replace(/<script[^>]*tag\.min\.js[^>]*>([\s\S]*?)<\/script>/gi, '');
    html = html.replace(/https?:\/\/llvpn\.com[^\s'"`]*/gi, `${localOrigin}/api/dummy.js`);

    // Bypass adblock.com detection request by replacing it with a local path (succeeds under 'self' CSP)
    html = html.replace(/https?:\/\/adblock\.com[^\s'"`]*/gi, '/');
    html = html.replace(/console\.log\(['"]AdBlock detected['"]\)/gi, 'console.log("AdBlock bypassed")');

    // IMPORTANT: hakunaymatata.com / bcdnxw CDN uses IP-bound signed tokens.
    // The 'sign' parameter is tied to the CLIENT browser's IP, not the server IP.
    // Server-side proxying will ALWAYS return 403 for these URLs.
    // Solution: inject play_url to detect IP-bound CDNs and return the direct URL,
    // letting the browser fetch it directly with no-referrer policy.
    // For all other CDNs, still use Vercel Edge proxy.
    const streamProxyBase = `${localOrigin}/api/video-proxy`;
    html = html.replace('function play_url(play_url,ext=0){', `function play_url(play_url,ext=0){ 
      if (window.hasExtensionActive) {
        return play_url;
      }
      // IP-bound CDNs: return direct URL (browser fetches with no-referrer)
      if (play_url && (play_url.includes('hakunaymatata.com') || play_url.includes('bcdnxw'))) {
        return play_url;
      }
      return "${streamProxyBase}?streamUrl=" + encodeURIComponent(play_url); `);

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
};
