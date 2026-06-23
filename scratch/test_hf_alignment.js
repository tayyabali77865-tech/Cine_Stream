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

    const workerBase = 'https://tayyabali888-tayyab.hf.space/proxy';

    // Step 1: Fetch the player page HTML THROUGH the Hugging Face Space Worker!
    const workerPlayerUrl = `${workerBase}?playerUrl=${encodeURIComponent(playerUrl)}`;
    console.log('1. Fetching player page through Hugging Face Space:', workerPlayerUrl);

    const playerRes = await fetch(workerPlayerUrl, {
      headers: {
        'Referer': 'https://netmirror.global/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log('Player Res Status:', playerRes.status, playerRes.statusText);
    const html = await playerRes.text();
    console.log('HTML Length:', html.length);

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

    // Step 3: Fetch the stream URL through the SAME Hugging Face Space!
    const workerStreamUrl = `${workerBase}?streamUrl=${encodeURIComponent(streamUrl)}`;
    console.log('3. Requesting stream through Hugging Face Space:', workerStreamUrl);

    const streamRes = await fetch(workerStreamUrl, {
      headers: {
        'Range': 'bytes=0-99',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log('4. Hugging Face Response Status:', streamRes.status, streamRes.statusText);
    console.log('   Headers:', Object.fromEntries(streamRes.headers.entries()));
  } catch (err) {
    console.error(err);
  }
}

run();
