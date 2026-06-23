async function testWorkingProxy() {
  try {
    const slug = 'movie-112235';
    console.log('1. Fetching details for slug:', slug);
    const detailsRes = await fetch(`http://localhost:3000/api/movie/${slug}`);
    const details = await detailsRes.json();
    const videoUrl = details.data.videoUrl;
    console.log('   Player Proxy URL:', videoUrl);

    console.log('2. Fetching player HTML...');
    const playerRes = await fetch(`http://localhost:3000${videoUrl}`);
    const html = await playerRes.text();

    console.log('3. Extracting stream URL from player HTML...');
    const playUrlRegex = /play_url\(\s*['"]([^'"]+)['"]/g;
    const matches = [];
    let match;
    while ((match = playUrlRegex.exec(html)) !== null) {
      matches.push(match[1]);
    }

    const originalStreamUrl = matches[0];
    console.log('   Original CDN stream URL:', originalStreamUrl);

    // Request through our local proxy
    const proxiedStreamUrl = `http://localhost:3000/api/video-proxy?streamUrl=${encodeURIComponent(originalStreamUrl)}`;
    console.log('4. Requesting stream through our proxy:', proxiedStreamUrl);

    const streamRes = await fetch(proxiedStreamUrl, {
      headers: {
        'Range': 'bytes=0-99',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log('5. Proxy response status:', streamRes.status, streamRes.statusText);
    const text = await streamRes.text();
    console.log('   Response body (first 200 chars):', text.slice(0, 200));
  } catch (err) {
    console.error('Error during verification:', err);
  }
}

testWorkingProxy();
