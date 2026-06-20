const { clientPromise, dbLog } = require('../../lib/mongodb');
const cheerio = require('cheerio'); // Lightweight parser imported for Vercel compatibility

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
      scrapedAt: new Date()
    };
  });
}

// Scraper Engine function returning details of added count
async function runScraperTask() {
  const client = await clientPromise;
  const db = client.db();
  const moviesCollection = db.collection('movies');
  let addedCount = 0;

  await dbLog('info', 'Scraper started executing incremental cycle.');

  for (const cat of CATEGORIES) {
    try {
      const url = `${API_BASE_3}/tranding?id=${cat.id}&page=0`;
      const response = await fetchWithRetry(url);
      const data = await response.json();

      if (data.results && Array.isArray(data.results)) {
        const mapped = mapMovieResults(data.results, cat.slug);
        
        for (const movie of mapped) {
          // Check if exists in MongoDB (incremental check)
          const exists = await moviesCollection.findOne({ slug: movie.slug });
          if (!exists) {
            await moviesCollection.insertOne(movie);
            addedCount++;
          }
        }
      }
    } catch (err) {
      await dbLog('error', `Failed to scrape category ${cat.name}`, { error: err.message });
      throw err; // propagate to trigger retry system
    }
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  await dbLog('info', `Scraper finished successfully. Added ${addedCount} new records.`);
  return addedCount;
}

export default async function handler(req, res) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const added = await runScraperTask();
      return res.status(200).json({
        success: true,
        message: `Scrape completed successfully on attempt ${attempts}.`,
        added
      });
    } catch (err) {
      console.error(`Attempt ${attempts} failed:`, err.message);
      await dbLog('warn', `Scraping attempt ${attempts} failed: ${err.message}`);
      if (attempts >= maxAttempts) {
        await dbLog('error', `Scraping failed after ${maxAttempts} attempts.`, { error: err.message });
        return res.status(500).json({
          success: false,
          error: `Scraping failed after ${maxAttempts} attempts. Last error: ${err.message}`
        });
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};
