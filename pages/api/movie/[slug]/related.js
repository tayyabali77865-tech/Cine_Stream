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
  try {
    const { title } = req.query;
    if (!title) {
      return res.status(200).json({ success: true, data: [] });
    }

    const url = `${API_BASE_4}/related/${encodeURIComponent(title)}?page=0`;
    let response;
    try {
      response = await fetchWithRetry(url);
    } catch (fetchErr) {
      console.warn('Failed to fetch related movies from API:', fetchErr.message);
      return res.status(200).json({ success: true, data: [] });
    }

    if (!response || !response.ok) {
      console.warn('API returned non-200 response for related:', response ? response.status : 'no response');
      return res.status(200).json({ success: true, data: [] });
    }

    const data = await response.json();
    const mapped = mapMovieResults(data.results);

    return res.status(200).json({
      success: true,
      data: mapped
    });
  } catch (error) {
    console.error('Error in related dubbed versions api:', error.message);
    return res.status(200).json({ success: true, data: [] });
  }
};
