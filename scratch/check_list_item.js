async function check() {
  const url = 'https://api2.imdb3.shop/api/tranding?id=18&page=0';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const data = await res.json();
    console.log('List Item:', JSON.stringify(data.results[0], null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}
check();
