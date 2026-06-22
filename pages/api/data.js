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

function mapMovieResults(results) {
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
      vote_average: item.vote_average || '0'
    };
  });
}

function sortTrendingMovies(movies) {
  return movies.sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();

    const aIsAnime = aTitle.includes('anime') || a.category === 'anime';
    const bIsAnime = bTitle.includes('anime') || b.category === 'anime';
    if (aIsAnime && !bIsAnime) return -1;
    if (!aIsAnime && bIsAnime) return 1;

    const isIndian = (item, title) => {
      if (item.isIndian === true) return true;
      if (item.isIndian === false) return false;

      const cat = (item.category || '').toLowerCase();
      if (cat === 'bollywood' || cat === 'south-hindi') return true;
      
      const indianKeywords = [
        'bollywood', 'south hindi', 'tollywood', 'kollywood', 'punjabi', 
        'tamil', 'telugu', 'kannada', 'malayalam', 'bhojpuri', 'bengali', 
        'marathi', 'indian', 'kapil sharma', 'bigg boss', 'indian idol', 
        'india\'s got talent', 'super dancer', 'pati patni aur panga', 
        'two much with kajol', 'pitch to get rich', 'suriya', 'kanguva',
        'pushpa', 'singham', 'bhooth', 'bangla', 'raakh', 'latent', 'india'
      ];
      if (indianKeywords.some(kw => title.includes(kw))) return true;
      
      if (!['anime', 'k-drama', 'c-drama', 'hollywood'].includes(cat) && (title.includes('hindi') || title.includes('[hindi]'))) {
        return true;
      }
      
      if (cat === 'reality-tv' && title.includes('[hindi]')) return true;
      
      return false;
    };

    const aIsIndian = isIndian(a, aTitle);
    const bIsIndian = isIndian(b, bTitle);
    if (!aIsIndian && bIsIndian) return -1;
    if (aIsIndian && !bIsIndian) return 1;

    return 0;
  });
}

export default async function handler(req, res) {
  const { page = 1, category } = req.query;
  const pageIndex = Math.max(0, parseInt(page) - 1);

  // 1. Try querying the MongoDB Cache first
  try {
    const client = await clientPromise;
    const db = client.db();
    
    const queryObj = {};
    if (category && category !== 'home') {
      queryObj.category = category;
    } else if (!category) {
      queryObj.category = 'trending';
    }
    
    const limit = 24;
    const skip = pageIndex * limit;

    let paginated;
    let totalCount;

    if (category === 'trending' || !category) {
      const allTrending = await db.collection('movies')
        .find({ category: 'trending' })
        .sort({ scrapedAt: -1 })
        .toArray();

      const sortedTrending = sortTrendingMovies(allTrending);

      totalCount = sortedTrending.length;
      paginated = sortedTrending.slice(skip, skip + limit);
    } else {
      totalCount = await db.collection('movies').countDocuments(queryObj);
      paginated = await db.collection('movies')
        .find(queryObj)
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
                if (isInd !== null) {
                  movie.isIndian = isInd;
                }

                const exists = await db.collection('movies').findOne({ slug: movie.slug });
                if (!exists) {
                  await db.collection('movies').insertOne(movie);
                } else if (isInd !== null) {
                  await db.collection('movies').updateOne({ slug: movie.slug }, { $set: { isIndian: isInd } });
                }
              }

              // Re-query database after inserts
              if (category === 'trending' || !category) {
                const allTrending = await db.collection('movies')
                  .find({ category: 'trending' })
                  .sort({ scrapedAt: -1 })
                  .toArray();

                const sortedTrending = sortTrendingMovies(allTrending);
                totalCount = sortedTrending.length;
                paginated = sortedTrending.slice(skip, skip + limit);
              } else {
                paginated = await db.collection('movies')
                  .find(queryObj)
                  .sort({ scrapedAt: -1 })
                  .skip(skip)
                  .limit(limit)
                  .toArray();
                totalCount = await db.collection('movies').countDocuments(queryObj);
              }
            }
          }
        } catch (liveErr) {
          console.error('[Live Fallback/Cache Update Error] Failed to fetch live page:', liveErr.message);
        }
      }
    }
      
    if (totalCount > 0) {
      return res.status(200).json({
        success: true,
        page: parseInt(page),
        category: category || 'home',
        count: totalCount,
        data: paginated
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
    const mapped = mapMovieResults(data.results);

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
