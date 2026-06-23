async function testWorkerDirectly() {
  try {
    const slug = 'movie-110007';
    console.log('1. Fetching details for slug:', slug);
    const detailsRes = await fetch(`https://api2.imdb3.shop/api/movie/110007`);
    const details = await detailsRes.json();
    const item = details.results[0];

    // Generate player URL (simplified signature logic to get stream URL)
    const crypto = require('crypto');
    const HMAC_KEY = 'net###@@sss';
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', HMAC_KEY).update(String(ts)).digest('hex');
    const na = encodeURIComponent(Buffer.from(item.title || '', 'utf8').toString('base64'));
    let playerUrl = `https://spedostream2.shop/play/watchbox.php?id=${item.subjectid}&se=0&ep=0&dp=${item.dp}&na=${na}`;
    playerUrl = playerUrl + "&ts=" + ts + "&sig=" + sig + "&exten=true";

    console.log('2. Fetching player HTML from:', playerUrl);
    const playerRes = await fetch(playerUrl, {
      headers: {
        'Referer': 'https://netmirror.global/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await playerRes.text();

    console.log('3. Extracting stream URL...');
    const playUrlRegex = /play_url\(\s*['"]([^'"]+)['"]/g;
    const playUrlMatch = playUrlRegex.exec(html);
    const streamUrl = playUrlMatch ? playUrlMatch[1] : null;

    if (!streamUrl) {
      console.log('Failed to extract stream URL. HTML length:', html.length);
      return;
    }

    console.log('Stream URL:', streamUrl);

    // Call Cloudflare Worker directly
    const workerUrl = `https://cine-stream-proxy.tayyabali77865.workers.dev?streamUrl=${encodeURIComponent(streamUrl)}`;
    console.log('4. Requesting stream through Cloudflare Worker:', workerUrl);

    const res = await fetch(workerUrl, {
      headers: {
        'Range': 'bytes=0-99',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log('5. Worker Response Status:', res.status, res.statusText);
    console.log('   Headers:', Object.fromEntries(res.headers.entries()));
  } catch (err) {
    console.error('Error:', err);
  }
}

testWorkerDirectly();
