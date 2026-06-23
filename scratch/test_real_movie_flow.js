const crypto = require('crypto');

const HMAC_KEY = 'net###@@sss';

function getSignature(timestamp) {
  return crypto
    .createHmac('sha256', HMAC_KEY)
    .update(String(timestamp))
    .digest('hex');
}

function generateMoviePlayerUrl(embed, embedEn) {
  if (!embed) return '';
  const ts = Math.floor(Date.now() / 1000);
  const sig = getSignature(ts);
  let vt = embed;
  if (embedEn === "1" || embedEn === 1) {
    vt = vt.replace("/watch", "/play/watch").replace("/?url", ".php?url");
  }
  vt = vt + "&ts=" + ts + "&sig=" + sig + "&exten=true";
  vt = vt.replace("netmirror.hair", "spedostream2.shop");
  return vt.replace(/&amp;/g, '&');
}

async function run() {
  try {
    const slug = 'movie-112235';
    console.log('1. Fetching details for:', slug);
    const detailsRes = await fetch(`https://api2.imdb3.shop/api/movie/112235?_cb=${Date.now()}`);
    const detailsData = await detailsRes.json();
    const item = detailsData.results[0];

    const playerUrl = generateMoviePlayerUrl(item.embed, item.embed_en);
    const workerBase = 'https://tayyabali888-tayyab.hf.space/proxy';

    const workerPlayerUrl = `${workerBase}?playerUrl=${encodeURIComponent(playerUrl)}`;
    console.log('2. Fetching player page through HF:', workerPlayerUrl);
    
    const playerRes = await fetch(workerPlayerUrl, {
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
      console.log('Failed to extract stream URL. HTML length:', html.length);
      console.log('HTML slice:', html.slice(0, 1000));
      return;
    }

    console.log('3. Fresh Stream URL:', streamUrl);

    const workerStreamUrl = `${workerBase}?streamUrl=${encodeURIComponent(streamUrl)}`;
    console.log('4. Fetching stream through HF:', workerStreamUrl);
    const streamRes = await fetch(workerStreamUrl, {
      headers: {
        'Range': 'bytes=0-99',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log('5. Response Status:', streamRes.status);
    console.log('Response Headers:', Object.fromEntries(streamRes.headers.entries()));
    const body = await streamRes.text();
    console.log('Body:', body.slice(0, 500));
  } catch (err) {
    console.error(err);
  }
}

run();
