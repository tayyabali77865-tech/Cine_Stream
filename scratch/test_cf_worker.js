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
    const detailsRes = await fetch(`https://api2.imdb3.shop/api/movie/110007?_cb=${Date.now()}`);
    const detailsData = await detailsRes.json();
    const item = detailsData.results[0];

    const playerUrl = generateSeriesPlayerUrl(item.subjectid, item.title, item.dp, 0, 0);

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
      console.log('Failed to extract stream URL.');
      return;
    }

    console.log('Stream URL:', streamUrl);

    // Fetch the stream URL through the user's Cloudflare Worker proxy
    const workerUrl = `https://cine-stream-proxy.tayyabali77865.workers.dev?streamUrl=${encodeURIComponent(streamUrl)}`;
    console.log('Testing Cloudflare Worker:', workerUrl);

    const streamRes = await fetch(workerUrl, {
      headers: {
        'Range': 'bytes=0-99',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log('Response Status:', streamRes.status);
    console.log('Headers:', Object.fromEntries(streamRes.headers.entries()));
    const body = await streamRes.text();
    console.log('Body (first 200 chars):', body.slice(0, 200));
  } catch (err) {
    console.error(err);
  }
}

run();
