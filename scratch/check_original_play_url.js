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
  const mediaType = 'movie';
  const id = '110007';
  const detailsRes = await fetch(`https://api2.imdb3.shop/api/${mediaType}/${id}`);
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
  const index = html.indexOf('function strp');
  if (index !== -1) {
    console.log('Found function strp:');
    console.log(html.slice(index, index + 2000));
  } else {
    console.log('strp not found in html');
  }
}

run();
