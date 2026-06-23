const { HttpsProxyAgent } = require('https-proxy-agent');
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

async function getProxies() {
  try {
    console.log('Fetching free proxies list...');
    const res = await fetch('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=3000&country=all&ssl=all&anonymity=anonymous');
    const text = await res.text();
    const list = text.split('\r\n').map(p => p.trim()).filter(Boolean);
    console.log(`Found ${list.length} proxies.`);
    return list;
  } catch (err) {
    console.error('Failed to fetch proxy list:', err);
    return [];
  }
}

async function run() {
  try {
    const detailsRes = await fetch(`https://api2.imdb3.shop/api/movie/112235?_cb=${Date.now()}`);
    const detailsData = await detailsRes.json();
    const item = detailsData.results[0];

    const playerUrl = generateMoviePlayerUrl(item.embed, item.embed_en);
    
    // Fetch player page directly (using residential IP)
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

    const proxyList = await getProxies();
    if (proxyList.length === 0) return;

    // Shuffle and test first 5 proxies
    const shuffled = proxyList.sort(() => 0.5 - Math.random()).slice(0, 10);

    for (const proxy of shuffled) {
      console.log(`\nTesting proxy: ${proxy}...`);
      const agent = new HttpsProxyAgent(`http://${proxy}`);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const res = await fetch(streamUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://fmoviesunblocked.net/',
            'Range': 'bytes=0-99'
          },
          agent,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.log(`Proxy ${proxy} Response Status:`, res.status, res.statusText);
        if (res.status === 206) {
          console.log(`SUCCESS! Working Proxy found: ${proxy}`);
          break;
        }
      } catch (err) {
        console.log(`Proxy ${proxy} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
