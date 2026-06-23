require('dotenv').config({ path: '.env.local' });
const { clientPromise } = require('../lib/mongodb');
const { runScraper } = require('../scraper'); // wait, let's look at pages/api/scrape.js

const API_BASE_3 = 'https://api2.imdb3.shop/api';

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

function mapMovieResults(results, categorySlug) {
  if (!results || !Array.isArray(results)) return [];
  return results.map(item => {
    let poster = item.backdrop_path || '';
    return {
      title: (item.title || '').trim(),
      url: `https://netmirror.global/${item.media_type || 'movie'}/${item.id}`,
      slug: `${item.media_type || 'movie'}-${item.id}`,
      poster: poster,
      media_type: item.media_type || 'movie',
      release_date: item.release_date || '',
      vote_average: item.vote_average || '0',
      category: categorySlug,
      scrapedAt: new Date()
    };
  });
}

async function runScraperTask() {
  const client = await clientPromise;
  const db = client.db();
  const moviesCollection = db.collection('movies');
  let addedCount = 0;

  console.log('Scraper started executing incremental cycle.');

  for (const cat of CATEGORIES) {
    console.log(`Scraping category: ${cat.name}`);
    try {
      for (let pageNum = 0; pageNum <= 30; pageNum++) {
        const url = `${API_BASE_3}/tranding?id=${cat.id}&page=${pageNum}`;
        const response = await fetchWithRetry(url);
        const data = await response.json();

        if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
          console.log(`  Category ${cat.name} ended at page ${pageNum}`);
          break;
        }

        const mapped = mapMovieResults(data.results, cat.slug);
        console.log(`  Page ${pageNum}: fetched ${mapped.length} movies.`);
        
        for (const movie of mapped) {
          const exists = await moviesCollection.findOne({ slug: movie.slug });
          
          let isInd = null;
          if (cat.slug === 'bollywood' || cat.slug === 'south-hindi') {
            isInd = true;
          } else if (cat.slug === 'hollywood' || cat.slug === 'anime' || cat.slug === 'k-drama' || cat.slug === 'c-drama') {
            isInd = false;
          }

          if (isInd !== null) {
            movie.isIndian = isInd;
          }

          if (!exists) {
            movie.categories = [cat.slug];
            await moviesCollection.insertOne(movie);
            addedCount++;
          } else {
            const updateFields = { $addToSet: { categories: cat.slug } };
            if (isInd !== null) updateFields.$set = { isIndian: isInd };
            await moviesCollection.updateOne({ slug: movie.slug }, updateFields);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (err) {
      console.error(`Failed to scrape category ${cat.name}:`, err.message);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Scraper finished. Added ${addedCount} new records.`);
}

runScraperTask();
