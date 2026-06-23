async function check() {
  const url = 'https://api2.imdb3.shop/api/tv/106728'; // True Beauty
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const data = await res.json();
    console.log('Results:', JSON.stringify(data.results[0], null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}
check();
