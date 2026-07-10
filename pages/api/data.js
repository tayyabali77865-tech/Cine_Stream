const { clientPromise } = require('../../lib/mongodb');

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

async function fetchWithRetry(url, options = {}, retries = 3, delay = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
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
      category: categorySlug || 'trending',
      scrapedAt: new Date()
    };
  });
}

function sortTrendingMovies(movies) {
  return movies.sort((a, b) => {
    const dateA = a.scrapedAt ? new Date(a.scrapedAt) : new Date(0);
    const dateB = b.scrapedAt ? new Date(b.scrapedAt) : new Date(0);
    return dateB - dateA;
  });
}

// Only fetch the fields the frontend actually uses
const MOVIE_PROJECTION = {
  _id: 0,
  title: 1,
  slug: 1,
  poster: 1,
  media_type: 1,
  release_date: 1,
  vote_average: 1,
  category: 1,
  categories: 1,
  scrapedAt: 1
};

export default async function handler(req, res) {
  // Cache paginated movie lists: fresh for 60s in browser, 5min at CDN, stale-while-revalidate 10min
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  const { page = 1, category } = req.query;
  const pageIndex = Math.max(0, parseInt(page) - 1);

  // 1. Try querying the MongoDB Cache first
  try {
    const client = await clientPromise;
    const db = client.db();
    
    const limit = 24;
    const skip = pageIndex * limit;

    let paginated;
    let totalCount;

    if (category === 'trending' || !category) {
      const allTrending = await db.collection('movies')
        .find({ $or: [{ category: 'trending' }, { categories: 'trending' }] }, { projection: MOVIE_PROJECTION })
        .sort({ scrapedAt: -1 })
        .toArray();

      const sortedTrending = sortTrendingMovies(allTrending);

      totalCount = sortedTrending.length;
      paginated = sortedTrending.slice(skip, skip + limit);
    } else {
      const queryObj = { $or: [{ category: category }, { categories: category }] };
      totalCount = await db.collection('movies').countDocuments(queryObj);
      paginated = await db.collection('movies')
        .find(queryObj, { projection: MOVIE_PROJECTION })
        .sort({ scrapedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    }

    // Dynamic on-demand update: fetch from live NetMirror API if there are fewer items than the limit
    if (paginated.length < limit) {
      const catSlug = category || 'trending';
      const match = CATEGORIES.find(c => c.slug === catSlug);
      let fetchUrl = '';
      if (match) {
        fetchUrl = `${API_BASE_3}/tranding?id=${match.id}&page=${pageIndex}`;
      } else if (!category) {
        fetchUrl = `${API_BASE_3}/movies/filter?page=${pageIndex}`;
      }

      if (fetchUrl) {
        try {
          console.log(`[Cache Update] Fetching page ${pageIndex} of category ${catSlug} from live API: ${fetchUrl}`);
          const response = await fetchWithRetry(fetchUrl);
          if (response.ok) {
            const liveData = await response.json();
            if (liveData.results && Array.isArray(liveData.results)) {
              const mapped = mapMovieResults(liveData.results, catSlug);
              
              for (const movie of mapped) {
                let isInd = null;
                if (catSlug === 'bollywood' || catSlug === 'south-hindi') {
                  isInd = true;
                } else if (catSlug === 'hollywood' || catSlug === 'anime' || catSlug === 'k-drama' || catSlug === 'c-drama') {
                  isInd = false;
                }

                // Atomic upsert — no duplicates possible
                const setOnInsert = {
                  title: movie.title,
                  url: movie.url,
                  poster: movie.poster,
                  media_type: movie.media_type,
                  release_date: movie.release_date,
                  vote_average: movie.vote_average,
                  category: catSlug,
                  scrapedAt: movie.scrapedAt
                };
                if (isInd !== null) setOnInsert.isIndian = isInd;

                const updateOp = {
                  $addToSet: { categories: catSlug },
                  $setOnInsert: setOnInsert
                };
                if (isInd !== null) updateOp.$set = { isIndian: isInd };

                await db.collection('movies').updateOne(
                  { slug: movie.slug },
                  updateOp,
                  { upsert: true }
                );
              }

              // Re-query database after inserts
              if (category === 'trending' || !category) {
                const allTrending = await db.collection('movies')
                  .find({ $or: [{ category: 'trending' }, { categories: 'trending' }] }, { projection: MOVIE_PROJECTION })
                  .sort({ scrapedAt: -1 })
                  .toArray();

                const sortedTrending = sortTrendingMovies(allTrending);
                totalCount = sortedTrending.length;
                paginated = sortedTrending.slice(skip, skip + limit);
              } else {
                const reQueryObj = { $or: [{ category: catSlug }, { categories: catSlug }] };
                paginated = await db.collection('movies')
                  .find(reQueryObj, { projection: MOVIE_PROJECTION })
                  .sort({ scrapedAt: -1 })
                  .skip(skip)
                  .limit(limit)
                  .toArray();
                totalCount = await db.collection('movies').countDocuments(reQueryObj);
              }
            }
          }
        } catch (liveErr) {
          console.error('[Live Fallback/Cache Update Error] Failed to fetch live page:', liveErr.message);
        }
      }
    }
      
    if (totalCount > 0) {
      // Deduplicate by slug before returning (safety net)
      const seen = new Set();
      const dedupedPaginated = paginated.filter(m => {
        if (seen.has(m.slug)) return false;
        seen.add(m.slug);
        return true;
      });
      return res.status(200).json({
        success: true,
        page: parseInt(page),
        category: category || 'home',
        count: totalCount,
        data: dedupedPaginated
      });
    }
    console.log('[Cache] Database cache is empty. Performing live fetch.');
  } catch (error) {
    console.warn('[Cache Error] MongoDB connection failed. Querying live API instead:', error.message);
  }

  // 2. Fail-Safe Fallback: Query live NetMirror API directly
  try {
    let url = `${API_BASE_3}/movies/filter?page=${pageIndex}`;
    if (category) {
      const match = CATEGORIES.find(c => c.slug === category);
      if (match) {
        url = `${API_BASE_3}/tranding?id=${match.id}&page=${pageIndex}`;
      }
    }

    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(`NetMirror request failed: ${response.status}`);
    }

    const data = await response.json();
    const mapped = mapMovieResults(data.results, category || 'trending');

    return res.status(200).json({
      success: true,
      page: parseInt(page),
      category: category || 'home',
      count: mapped.length,
      data: mapped
    });
  } catch (err) {
    console.error('[Fallback Error] Failed to fetch live data:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Both cache and live source are currently unavailable.',
      data: []
    });
  }
}
