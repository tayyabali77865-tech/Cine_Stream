const crypto = require('crypto');

async function testIpBinding() {
  try {
    const slug = 'movie-110007';
    console.log('1. Fetching player proxy HTML from Vercel/External source...');
    // We fetch details from Vercel to get the player page URL
    const detailsRes = await fetch(`https://cine-stream.vercel.app/api/movie/${slug}`);
    const details = await detailsRes.json();
    const videoUrl = details.data.videoUrl;
    console.log('   Video URL on Vercel:', videoUrl);

    // Fetch the player page HTML from Vercel.
    // The Vercel server will fetch the original player HTML from spedostream2.shop.
    // Thus, the signature in play_url is bound to Vercel's IP.
    const playerRes = await fetch(`https://cine-stream.vercel.app${videoUrl}`);
    const html = await playerRes.text();

    console.log('2. Extracting stream URL...');
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

    console.log('   Stream URL with signature (generated for Vercel IP):', streamUrl);

    console.log('3. Requesting stream URL directly from local machine (IP_Local)...');
    const res = await fetch(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://fmoviesunblocked.net/',
        'Range': 'bytes=0-99'
      }
    });

    console.log('   Status:', res.status, res.statusText);
  } catch (err) {
    console.error('Error:', err);
  }
}

testIpBinding();
