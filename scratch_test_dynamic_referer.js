const crypto = require('crypto');

const HMAC_KEY = 'net###@@sss';

function getSignature(timestamp) {
  return crypto
    .createHmac('sha256', HMAC_KEY)
    .update(String(timestamp))
    .digest('hex');
}

function generateSeriesPlayerUrl(subjectId, title, dp, seasonNum, episodeNum) {
  if (!subjectId || !dp) return '';
  const ts = Math.floor(Date.now() / 1000);
  const sig = getSignature(ts);
  const na = encodeURIComponent(Buffer.from(title || '', 'utf8').toString('base64'));
  let vt = `https://spedostream2.shop/play/watchbox.php?id=${subjectId}&se=${seasonNum}&ep=${episodeNum}&dp=${dp}&na=${na}`;
  vt = vt + "&ts=" + ts + "&sig=" + sig + "&exten=true";
  return vt;
}

async function testDynamicReferer(slug, isTv) {
  try {
    console.log(`\n=== Testing Slug: ${slug} ===`);
    const detailsRes = await fetch(`https://api2.imdb3.shop/api/${isTv ? 'tv' : 'movie'}/${slug.split('-')[1]}?_cb=${Date.now()}`);
    const detailsData = await detailsRes.json();
    const item = detailsData.results[0];

    let playerUrl = '';
    if (item.embed) {
      // Movie 112235 (direct embed)
      const ts = Math.floor(Date.now() / 1000);
      const sig = getSignature(ts);
      let vt = item.embed;
      if (item.embed_en === "1" || item.embed_en === 1) {
        vt = vt.replace("/watch", "/play/watch").replace("/?url", ".php?url");
      }
      vt = vt + "&ts=" + ts + "&sig=" + sig + "&exten=true";
      playerUrl = vt.replace("netmirror.hair", "spedostream2.shop").replace(/&amp;/g, '&');
    } else {
      playerUrl = generateSeriesPlayerUrl(item.subjectid, item.title, item.dp, 0, 0);
    }

    const playerRes = await fetch(playerUrl, {
      headers: {
        'Referer': 'https://netmirror.global/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await playerRes.text();
    const playUrlRegex = /play_url\(\s*['"]([^'"]+)['"]/g;
    const matches = [];
    let match;
    while ((match = playUrlRegex.exec(html)) !== null) {
      matches.push(match[1]);
    }

    const streamUrl = matches[0];
    if (!streamUrl) {
      console.log('Failed to retrieve stream URL.');
      return;
    }

    console.log('Extracted Stream URL:', streamUrl);

    // --- Dynamic Proxy Logic Simulation ---
    let currentUrl = streamUrl;
    let response;
    const range = 'bytes=0-99';

    // Parse origin dynamically from stream URL
    const urlObj = new URL(currentUrl);
    const dynamicReferer = urlObj.origin + '/';
    const dynamicOrigin = urlObj.origin;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Range': range,
      'Referer': dynamicReferer,
      'Origin': dynamicOrigin
    };

    console.log('Trying with dynamically derived Referer:', headers['Referer']);
    response = await fetch(currentUrl, { headers });
    console.log('Initial Response Status:', response.status);

    // Fallback if 403 Forbidden is returned
    if (response.status === 403) {
      console.log('403 Forbidden detected. Applying fallback Referer: https://fmoviesunblocked.net/');
      headers['Referer'] = 'https://fmoviesunblocked.net/';
      delete headers['Origin']; // Strip origin to prevent conflict
      response = await fetch(currentUrl, { headers });
      console.log('Fallback Response Status:', response.status);
    }

    console.log('Final Result Status:', response.status, response.statusText);
    console.log('Content-Type:', response.headers.get('content-type'));

  } catch (err) {
    console.error(err);
  }
}

async function run() {
  await testDynamicReferer('tv-112235', true);   // Working R2 movie
  await testDynamicReferer('movie-110007', false); // Protected CDN movie
}

run();
