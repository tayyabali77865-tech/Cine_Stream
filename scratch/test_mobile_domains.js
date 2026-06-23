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
  const playUrlRegex = /play_url\(\s*['"]([^'"]+)['"]/g;
  const matches = [];
  let match;
  while ((match = playUrlRegex.exec(html)) !== null) {
    matches.push(match[1]);
  }

  const originalStreamUrl = matches[0];
  if (!originalStreamUrl) {
    console.log('Failed to retrieve stream URL.');
    return;
  }

  const testDomains = [
    "sacdn.watch21.shop",
    "bcdn.watch22.shop"
  ];

  const testReferers = [
    "https://netmirror.global/",
    "https://spedostream2.shop/",
    "https://fmoviesunblocked.net/",
    ""
  ];

  for (const domain of testDomains) {
    for (const referer of testReferers) {
      const modifiedUrl = originalStreamUrl.replace("bcdnxw.hakunaymatata.com", domain);
      console.log(`\nDomain: ${domain} | Referer: ${referer || 'NONE'}`);

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': 'bytes=0-99'
      };
      if (referer) {
        headers['Referer'] = referer;
      }

      const res = await fetch(modifiedUrl, { headers });
      console.log(`Status: ${res.status} ${res.statusText}`);
    }
  }
}

run();
