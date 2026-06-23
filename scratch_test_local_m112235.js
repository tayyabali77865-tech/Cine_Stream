async function testLocalMovie112235() {
  try {
    const slug = 'movie-112235';
    console.log('1. Fetching movie details...');
    const detailsRes = await fetch(`http://localhost:3000/api/movie/${slug}`);
    const details = await detailsRes.json();
    const videoUrl = details.data.videoUrl;
    console.log('   Video URL from API:', videoUrl);

    console.log('2. Fetching player proxy page...');
    const playerRes = await fetch(`http://localhost:3000${videoUrl}`);
    const html = await playerRes.text();

    console.log('3. Extracting stream URL...');
    const playUrlRegex = /play_url\(\s*['"]([^'"]+)['"]/g;
    const playUrlMatch = playUrlRegex.exec(html);
    const streamUrl = playUrlMatch ? playUrlMatch[1] : null;
    console.log('   Stream URL:', streamUrl);

    if (!streamUrl) {
      console.log('Failed to extract stream URL. Player HTML was:', html);
      return;
    }

    // Now request it through our local proxy
    const proxiedUrl = `http://localhost:3000/api/video-proxy?streamUrl=${encodeURIComponent(streamUrl)}`;
    console.log('4. Requesting stream through our proxy:', proxiedUrl);

    const streamRes = await fetch(proxiedUrl, {
      headers: {
        'Range': 'bytes=0-99',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log('5. Proxy response status:', streamRes.status, streamRes.statusText);
    console.log('   Content-Type:', streamRes.headers.get('content-type'));
    console.log('   Content-Range:', streamRes.headers.get('content-range'));
  } catch (err) {
    console.error('Error:', err);
  }
}

testLocalMovie112235();
