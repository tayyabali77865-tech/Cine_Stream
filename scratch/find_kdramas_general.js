async function main() {
  const API_BASE_3 = 'https://api2.imdb3.shop/api';
  let kdramasCount = 0;
  console.log('Scanning general feed for K-Dramas...');
  for (let page = 0; page < 30; page++) {
    const url = `${API_BASE_3}/movies/filter?page=${page}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
      });
      const data = await res.json();
      if (!data.results || data.results.length === 0) break;
      
      const kdramas = data.results.filter(item => item.cn === 'Korea');
      if (kdramas.length > 0) {
        console.log(`Page ${page}: found ${kdramas.length} K-Dramas:`);
        kdramas.forEach(k => {
          console.log(`  - ${k.title} (ID: ${k.id}, cn: ${k.cn})`);
          kdramasCount++;
        });
      }
    } catch (err) {
      console.error(`Page ${page} failed:`, err.message);
    }
  }
  console.log(`Total K-Dramas found in general feed: ${kdramasCount}`);
}

main();
