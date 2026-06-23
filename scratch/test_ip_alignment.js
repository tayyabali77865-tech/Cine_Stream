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

async function run() {
  try {
    const mediaType = 'movie';
    const id = '110007';
    const detailsRes = await fetch(`https://api2.imdb3.shop/api/${mediaType}/${id}`);
    const detailsData = await detailsRes.json();
    const item = detailsData.results[0];

    const playerUrl = generateSeriesPlayerUrl(item.subjectid, item.title, item.dp, 0, 0);

    const workerBase = 'https://cine-stream-proxy.tayyabali77865.workers.dev';

    // Step 1: Fetch the player page HTML THROUGH the Cloudflare Worker!
    // This forces the player HTML to be requested by the Worker's IP.
    const workerPlayerUrl = `${workerBase}?playerUrl=${encodeURIComponent(playerUrl)}`;
    console.log('1. Fetching player page through Cloudflare Worker:', workerPlayerUrl);

    const playerRes = await fetch(workerPlayerUrl, {
      headers: {
        'Referer': 'https://netmirror.global/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await playerRes.text();

    // Step 2: Extract the stream URL
    const playUrlRegex = /play_url\(\s*['"]([^'"]+)['"]/g;
    const matches = [];
    let match;
    while ((match = playUrlRegex.exec(html)) !== null) {
      matches.push(match[1]);
    }

    const streamUrl = matches[0];
    if (!streamUrl) {
      console.log('Failed to extract stream URL.');
      return;
    }

    console.log('2. Extracted Stream URL:', streamUrl);

    // Step 3: Fetch the stream URL through the SAME Cloudflare Worker!
    // Since both player page and stream are requested by the Worker's IP, the CDN signature checks should pass!
    const workerStreamUrl = `${workerBase}?streamUrl=${encodeURIComponent(streamUrl)}`;
    console.log('3. Requesting stream through Cloudflare Worker:', workerStreamUrl);

    const streamRes = await fetch(workerStreamUrl, {
      headers: {
        'Range': 'bytes=0-99',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log('4. Worker Response Status:', streamRes.status, streamRes.statusText);
    console.log('   Headers:', Object.fromEntries(streamRes.headers.entries()));
  } catch (err) {
    console.error(err);
  }
}

run();
