const fetch = require('node-fetch');

async function test() {
  const url = 'https://pacdn.aoneroom.com/image/2025/04/14/c00377cb8d35f394e3f5f7df61f32908.jpg';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Body length:', (await res.buffer()).length);
  } catch (err) {
    console.error('Error fetching:', err);
  }
}

test();
