const { clientPromise } = require('../../lib/mongodb');

const API_BASE_4 = 'https://api2.imdb4.shop/api';

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
      vote_average: item.vote_average || '0'
    };
  });
}

export default async function handler(req, res) {
  const query = req.query.query || req.body.query;
  const page = req.query.page || 1;
  const pageIndex = Math.max(0, parseInt(page) - 1);

  if (!query) {
    return res.status(400).json({ success: false, error: 'Query parameter is required' });
  }

  // 1. Try querying the MongoDB Cache first
  try {
    const client = await clientPromise;
    const db = client.db();
    
    const searchQuery = {
      $or: [
        { $text: { $search: query } },
        { title: { $regex: query, $options: 'i' } }
      ]
    };

    const limit = 24;
    const skip = pageIndex * limit;

    const totalCount = await db.collection('movies').countDocuments(searchQuery);
    const paginated = await db.collection('movies')
      .find(searchQuery)
      .sort({ scrapedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
      
    if (totalCount > 0) {
      return res.status(200).json({
        success: true,
        query,
        count: totalCount,
        data: paginated
      });
    }
  } catch (error) {
    console.warn('[Search Cache Error] MongoDB search failed. Querying live API instead:', error.message);
  }

  // 2. Fail-Safe Fallback: Query live NetMirror Search API directly
  try {
    const url = `${API_BASE_4}/search2/${encodeURIComponent(query)}?page=${pageIndex}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(`NetMirror search failed: ${response.status}`);
    }

    const data = await response.json();
    const mapped = mapMovieResults(data.results);

    return res.status(200).json({
      success: true,
      query,
      count: mapped.length,
      data: mapped
    });
  } catch (err) {
    console.error('[Search Fallback Error] Failed to search live data:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Search is currently unavailable.',
      data: []
    });
  }
}
