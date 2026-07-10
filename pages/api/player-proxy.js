const crypto = require('crypto');

// Player domain fallbacks — tried in order when primary returns 404/5xx
const PLAYER_FALLBACK_DOMAINS = [
  'spedostream2.shop',
  'bcdnxw.hakunaymatata.com',
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

// Minimal HTML5 player for watchflmy-type URLs
// (no external React app needed — just decode the base64 video URL)
function buildInlinePlayer(proxiedVideoUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Player</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#000;overflow:hidden}
  #art{width:100vw;height:100vh}
  .error{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0b0f19;color:#94a3b8;font-family:Inter,sans-serif;gap:12px;text-align:center;padding:20px}
  .error .icon{font-size:48px}
  .error p{font-size:14px;line-height:1.7;max-width:320px}
</style>
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<script src="https://cdn.jsdelivr.net/npm/artplayer@5/dist/artplayer.js"></script>
</head>
<body>
<div id="art"></div>
<script>
  var videoUrl = ${JSON.stringify(proxiedVideoUrl)};
  
  // Detect non-browser-playable formats (MKV, AVI, etc.)
  function isPlayableInBrowser(url) {
    var lower = url.toLowerCase().split('?')[0];
    var nonPlayable = ['.mkv', '.avi', '.wmv', '.flv', '.mov', '.ts', '.vob'];
    return !nonPlayable.some(function(ext) { return lower.endsWith(ext); });
  }

  function showDownloadPage(downloadPageUrl) {
    document.getElementById('art').style.display = 'none';
    document.body.innerHTML = '<div class="error"><div class="icon">&#128229;</div>' +
      '<p>This video is only available as a download (MKV format). Click the button below to open the download page.</p>' +
      '<a href="' + downloadPageUrl + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-family:Inter,sans-serif;">&#11015; Open Download Page</a></div>';
  }

  function showError() {
    document.body.innerHTML = '<div class="error"><div class="icon">&#127916;</div><p>Video could not be loaded. Try another server button above the player.</p></div>';
  }

  function initPlayer(url) {
    if (!isPlayableInBrowser(url)) {
      showDownloadPage(url);
      return;
    }
    var art = new Artplayer({
      container: '#art',
      url: url,
      autoplay: false,
      muted: false,
      volume: 0.8,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: false,
      miniProgressBar: true,
      mutex: true,
      theme: '#e50914',
      lang: 'en',
    });

    // Apply no-referrer to the underlying video element after player init
    art.on('ready', function() {
      var vid = art.video;
      if (vid) {
        vid.setAttribute('referrerpolicy', 'no-referrer');
        vid.removeAttribute('crossorigin');
      }
    });
    HTMLMediaElement.prototype.play = function() {
      return _origPlay.apply(this, arguments).catch(function(e) {
        if (e && e.name === 'AbortError') { return; }
        throw e;
      });
    };

    art.on('ready', function() {
      art.muted = true;
      art.play().then(function() {
        setTimeout(function() { art.muted = false; }, 100);
      }).catch(function(e) {
        art.muted = false;
        console.log('[player] Autoplay blocked, waiting for user interaction:', e.message);
      });
    });

    art.on('error', function(error, reconnectTime) {
      console.error('[player] Video error:', error);
      if (!reconnectTime || reconnectTime > 3) {
        showError();
      }
    });
  }

  // Pre-check the proxy URL before giving it to artplayer
  // This catches: 422 download_only, MKV redirects, HTML pages served as video
  fetch(videoUrl, { method: 'GET', headers: { 'Range': 'bytes=0-1023' } })
    .then(function(r) {
      // 422 = download-only content (filesdl.top MKV, etc.)
      if (r.status === 422) {
        return r.json().then(function(data) {
          if (data && data.type === 'download_only' && data.download_page) {
            showDownloadPage(data.download_page);
          } else {
            showError();
          }
        }).catch(showError);
      }

      // Check content-type of the actual response (after following redirects)
      var ct = r.headers.get('content-type') || '';
      var finalUrl = r.url; // URL after following all redirects

      // If response is HTML or JSON — it's not a video stream
      if (ct.includes('text/html') || ct.includes('application/json')) {
        console.warn('[player] Proxy returned non-video content-type:', ct);
        showError();
        return;
      }

      // Check if the final URL (after redirect) has a non-playable extension
      if (!isPlayableInBrowser(finalUrl)) {
        console.warn('[player] Final URL is non-playable format:', finalUrl);
        showDownloadPage(finalUrl);
        return;
      }

      // All checks passed — init the player with the original proxy URL
      // (browser will follow redirects automatically for video element)
      initPlayer(videoUrl);
    })
    .catch(function(e) {
      console.warn('[player] Pre-check failed, attempting playback anyway:', e.message);
      initPlayer(videoUrl);
    });
</script>
</body>
</html>`;
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
    <p>This video could not be loaded from any server. Try another server button above the player.</p>
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

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

    let workerUrl = process.env.CLOUDFLARE_WORKER_URL || null;
    if (!workerUrl) {
      console.warn('[player-proxy] CLOUDFLARE_WORKER_URL not set — running in direct fetch mode (local/dev).');
    } else if (!workerUrl.startsWith('http://') && !workerUrl.startsWith('https://')) {
      workerUrl = `https://${workerUrl}`;
    }

    const host = req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const localOrigin = `${proto}://${host}`;

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

    // -----------------------------------------------------------------------
    // FAST PATH: watchflmy-type URLs contain a base64-encoded video URL.
    // Decode it and serve our own ArtPlayer — no external React app needed,
    // no CORS issues, no API calls to api2.imdb3.shop.
    // -----------------------------------------------------------------------
    try {
      const parsedForExtract = new URL(targetUrl);
      if (
        parsedForExtract.pathname.includes('/watchflmy') ||
        parsedForExtract.pathname.includes('/watchflm')
      ) {
        const encodedVideoUrl = parsedForExtract.searchParams.get('url');
        if (encodedVideoUrl) {
          const decodedVideoUrl = Buffer.from(encodedVideoUrl, 'base64').toString('utf-8');
          console.log(`[player-proxy] watchflmy fast path: decoded video URL = ${decodedVideoUrl}`);

          if (decodedVideoUrl.startsWith('http')) {
            // Check if the signed URL has an expired timestamp
            let urlExpired = false;
            try {
              const decodedParsed = new URL(decodedVideoUrl);
              const tParam = decodedParsed.searchParams.get('t');
              if (tParam) {
                const urlTimestamp = parseInt(tParam, 10);
                const nowTimestamp = Math.floor(Date.now() / 1000);
                const ageSeconds = nowTimestamp - urlTimestamp;
                if (ageSeconds > 3600) { // Expired if older than 1 hour
                  console.warn(`[player-proxy] watchflmy URL expired (age: ${Math.round(ageSeconds/60)}min), falling back to full player fetch for fresh URL`);
                  urlExpired = true;
                }
              }
            } catch (e) {}

            if (!urlExpired) {
              // hakunaymatata.com blocks direct requests → use Vercel proxy
              // All other CDNs → direct URL (zero server bandwidth)
              const isHakuna = decodedVideoUrl.includes('hakunaymatata.com');
              const proxiedVideoUrl = isHakuna
                ? `${localOrigin}/api/video-proxy?streamUrl=${encodeURIComponent(decodedVideoUrl)}`
                : decodedVideoUrl; // Direct CDN — browser fetches with no-referrer
              console.log('[STREAM ROUTE watchflmy]', isHakuna ? '[Vercel]' : '[Direct CDN]', proxiedVideoUrl);
              res.setHeader('Content-Type', 'text/html');
              return res.status(200).send(buildInlinePlayer(proxiedVideoUrl));
            }
            // If expired, fall through to the full player fetch below
          }
        }
      }
    } catch (e) {
      console.warn('[player-proxy] watchflmy fast-path failed, falling back:', e.message);
    }

    console.log("FINAL TARGET URL:", targetUrl);

    const headers = {
      'Referer': 'https://netmirror.global/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (req.headers.cookie) {
      headers['Cookie'] = req.headers.cookie;
    }

    // --- Multi-domain fallback chain ---
    let response = null;
    let successUrl = null;

    // Always fetch player HTML directly (NOT through CF Worker)
    // so that the correct Referer: netmirror.global reaches spedostream2.shop
    for (const domain of PLAYER_FALLBACK_DOMAINS) {
      const candidateUrl = buildFallbackUrl(targetUrl, domain);
      if (!candidateUrl) continue;

      try {
        const r = await fetch(candidateUrl, { headers });
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
      console.error('[player-proxy] All fallback domains failed for:', targetUrl);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(errorPage('All CDN servers returned 404'));
    }

    // Forward Set-Cookie headers
    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie');
    if (setCookieHeaders) {
      res.setHeader('Set-Cookie', setCookieHeaders);
    }

    let html = await response.text();
    html = html.replace(/<meta[^>]*content-security-policy[^>]*>/gi, '');

    // Base href and asset origin (always use original domain for assets with CORS headers)
    const parsedOriginal = new URL(url);
    const originalOrigin = parsedOriginal.protocol + '//' + parsedOriginal.host;
    let baseHref = originalOrigin + '/play/';

    const adblockBypassScript = `
      <script>
        // ── Adblock bypass ──────────────────────────────────────────────
        window.adblock = false;
        window.adblock3 = false;
        window.canRunAds = true;
        window.adblockDetected = false;
        window.checkAdBlock = function() { return false; };

        // ── Spoof document.referrer so the player thinks we came from netmirror.global ──
        try {
          Object.defineProperty(document, 'referrer', {
            get: function() { return 'https://netmirror.global/'; },
            configurable: true
          });
        } catch(e) {}

        // ── Mark extension as active immediately ──────────────────────
        window.hasExtensionActive = true;
        window.isListedWebsite = true;
        window.checkOrigin = function() { return true; };
        window.verifySource = function() { return true; };

        // ── Respond to extension check messages ───────────────────────
        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'NETMIRROR_CHECK') {
            window.postMessage({ type: 'NETMIRROR_EXTENSION_DETECTED' }, '*');
          }
          if (event.data && event.data.type === 'NETMIRROR_EXTENSION_DETECTED') {
            window.hasExtensionActive = true;
          }
        });

        // ── Apply no-referrer to video element when it appears ────────
        document.addEventListener('DOMContentLoaded', () => {
          const observer = new MutationObserver(() => {
            const video = document.querySelector('video');
            if (video) {
              video.setAttribute('referrerpolicy', 'no-referrer');
              video.removeAttribute('crossorigin');
              observer.disconnect();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        });
      </script>
    `;
    html = html.replace(/<head>/i, `<head>${adblockBypassScript}<base href="${baseHref}">`);

    html = html.replace(/params\.get\(['"]exten['"]\)/g, '"true"');
    html = html.replace(/<script[^>]*llvpn\.com[^>]*>([\s\S]*?)<\/script>/gi, '');
    html = html.replace(/https?:\/\/llvpn\.com[^\s'"`]*/gi, `${localOrigin}/api/dummy.js`);
    html = html.replace(/https?:\/\/adblock\.com[^\s'"`]*/gi, '/');

    // ── Strip any hardcoded "Not Found" / "Come from listed Website" checks ──
    // Replace the error string so the condition never triggers visually
    html = html.replace(/Not Found\.?\s*or\s*Come from listed Website\.?/gi, '');
    html = html.replace(/Come from listed Website/gi, '');
    // Nullify any domain whitelist array checks: replace the check result with true
    html = html.replace(/\[([\s\S]{0,300}?)\]\.includes\(\s*(?:location\.hostname|window\.location\.hostname|document\.domain|new URL\(document\.referrer\)\.hostname)\s*\)/g, 'true');
    // Spoof location.hostname to netmirror.global for any remaining checks
    html = html.replace(/location\.hostname/g, '"netmirror.global"');

    // ── Direct CDN Streaming (Zero Server Bandwidth) ──────────────────────────
    // Video plays directly from CDN in the browser.
    // The video element already has referrerpolicy="no-referrer" set (see MutationObserver above),
    // so CDN receives NO Referer header and allows the request.
    // EXCEPTION: hakunaymatata.com blocks all non-whitelisted IPs → must use Vercel proxy.
    const vercelProxyUrl = `${localOrigin}/api/video-proxy`;
    html = html.replace('function play_url(play_url,ext=0){', `function play_url(play_url,ext=0){ 
      // Check if the signed URL has an expired t= timestamp — reload for fresh URL if so
      try {
        const urlObj = new URL(play_url);
        const tParam = urlObj.searchParams.get('t');
        if (tParam) {
          const urlTs = parseInt(tParam, 10);
          const nowTs = Math.floor(Date.now() / 1000);
          if (nowTs - urlTs > 3600) {
            console.warn('[STREAM] URL expired, reloading for fresh signed URL...');
            setTimeout(function() { window.location.reload(); }, 100);
            return play_url;
          }
        }
      } catch(e) {}
      // hakunaymatata.com must go through Vercel proxy (it blocks direct requests)
      // Everything else: return the direct CDN URL — browser plays it with no-referrer policy
      if (play_url.includes('hakunaymatata.com')) {
        console.log('[STREAM ROUTE] hakunaymatata → Vercel proxy');
        return "${vercelProxyUrl}?streamUrl=" + encodeURIComponent(play_url);
      }
      console.log('[STREAM ROUTE] Direct CDN (zero bandwidth) →', play_url);
      return play_url; `);

    const extraStyles = `
      <style>
        html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important}
        .popup-window-ext,.if_ext,.server{display:none!important}
        .artplayer-app,.art-video-player,.art-video{width:100vw!important;height:100vh!important;min-height:100vh!important;max-height:100vh!important;overflow:hidden!important}
        @media only screen and (max-width:768px){.artplayer-app,.art-video-player,.art-video{height:100dvh!important}.art-video{object-fit:fill!important}}
        .art-video-player{display:flex!important;flex-direction:column!important}
        .art-video{flex:1!important;min-height:0!important;height:100%!important}
        .art-bottom{padding-bottom:0!important;margin-bottom:0!important;height:auto!important;overflow:hidden!important}
        .art-icon-state{width:55px!important;height:55px!important}
        .art-icon-state svg{width:100%!important;height:100%!important}
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
