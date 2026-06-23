async function test() {
  const API_BASE_3 = 'https://api2.imdb3.shop/api';
  const categoryId = 18; // K-Drama
  for (let page = 0; page < 5; page++) {
    const url = `${API_BASE_3}/tranding?id=${categoryId}&page=${page}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      console.log(`Page ${page}: results length = ${data.results ? data.results.length : 'undefined'}`);
      if (data.results && data.results.length > 0) {
        console.log(`First item on page ${page}:`, data.results[0].title);
      }
    } catch (err) {
      console.error(`Page ${page} failed:`, err.message);
    }
  }
}
test();
