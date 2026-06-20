const fs = require('fs');
const path = require('path');

const API_BASE_3 = 'https://api2.imdb3.shop/api';
const DB_FILE = path.join(__dirname, 'db.json');

const CATEGORIES = [
  { name: "Trending", slug: "trending", id: 11 },
  { name: "Bollywood", slug: "bollywood", id: 14 },
  { name: "South Hindi", slug: "south-hindi", id: 15 },
  { name: "Hollywood", slug: "hollywood", id: 13 },
  { name: "Anime", slug: "anime", id: 30 },
  { name: "K-Drama", slug: "k-drama", id: 18 },
  { name: "C-Drama", slug: "c-drama", id: 39 },
  { name: "Reality TV", slug: "reality-tv", id: 37 },
  { name: "Action Movies", slug: "action", id: 31 },
  { name: "Romantic Movies", slug: "romance", id: 33 },
  { name: "Horror Movies", slug: "horror", id: 32 }
];

// Read local database
function readDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    return { movies: [] };
  }
  try {
    const content = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Error reading database file, resetting:', err.message);
    return { movies: [] };
  }
}

// Write to local database
function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing database file:', err.message);
  }
}

// Fetch with retry helper
async function fetchWithRetry(url, options = {}, retries = 3, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
    } catch (err) {
      if (i === retries - 1) throw err;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Map NetMirror results to client structure
function mapMovieResults(results, categorySlug) {
  if (!results || !Array.isArray(results)) return [];
  return results.map(item => {
    let poster = item.backdrop_path || '';
    if (poster) {
      poster = poster.replace('pbcdnw', 'pacdn');
    }
    return {
      title: (item.title || '').trim(),
      url: `https://netmirror.global/${item.media_type || 'movie'}/${item.id}`,
      slug: `${item.media_type || 'movie'}-${item.id}`,
      poster: poster,
      media_type: item.media_type || 'movie',
      release_date: item.release_date || '',
      vote_average: item.vote_average || '0',
      category: categorySlug,
      scrapedAt: new Date().toISOString()
    };
  });
}

// Incremental Scraper Engine
async function runScraper() {
  console.log(`[Scraper] Starting incremental scraping cycle...`);
  const db = readDatabase();
  let addedCount = 0;

  // Track existing movies by slug to avoid duplicates
  const existingSlugs = new Set(db.movies.map(m => m.slug));

  for (const cat of CATEGORIES) {
    console.log(`[Scraper] Fetching category: ${cat.name}`);
    try {
      // Scrape first page (latest entries) for incremental updates
      const url = `${API_BASE_3}/tranding?id=${cat.id}&page=0`;
      const response = await fetchWithRetry(url);
      const data = await response.json();

      if (data.results && Array.isArray(data.results)) {
        const mapped = mapMovieResults(data.results, cat.slug);
        
        mapped.forEach(movie => {
          if (!existingSlugs.has(movie.slug)) {
            db.movies.unshift(movie); // Prepend new movies to keep them at the top of the database
            existingSlugs.add(movie.slug);
            addedCount++;
          }
        });
      }
    } catch (err) {
      console.error(`[Scraper] Failed to scrape category ${cat.name}:`, err.message);
    }
    // Respectful delay between categories
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (addedCount > 0) {
    // Sort movies so newest scraped items are at the beginning
    db.movies.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));
    writeDatabase(db);
    console.log(`[Scraper] Success! Added ${addedCount} new movies to database.`);
  } else {
    console.log(`[Scraper] Finished. No new updates found.`);
  }

  return {
    success: true,
    added: addedCount,
    total: db.movies.length,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  runScraper,
  readDatabase
};
