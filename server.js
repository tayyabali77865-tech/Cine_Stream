const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { runScraper, readDatabase } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' https: blob:; connect-src 'self' https:; frame-src 'self' https:; frame-ancestors 'none';");
  next();
});

const API_BASE_3 = 'https://api2.imdb3.shop/api';
const API_BASE_4 = 'https://api2.imdb4.shop/api';
const HMAC_KEY = 'net###@@sss';

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

// Helper to generate cryptographic signature for NetMirror player
function getSignature(timestamp) {
  return crypto
    .createHmac('sha256', HMAC_KEY)
    .update(String(timestamp))
    .digest('hex');
}

// Resilient Fetch with Retry mechanism to handle connection/DNS blips
async function fetchWithRetry(url, options = {}, retries = 4, delay = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Fetch failed for ${url}, retrying in ${delay}ms... (${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Generate signed Movie Player URL
function generateMoviePlayerUrl(embed, embedEn) {
  if (!embed) return '';
  const ts = Math.floor(Date.now() / 1000);
  const sig = getSignature(ts);
  let vt = embed;
  if (embedEn === "1" || embedEn === 1) {
    vt = vt.replace("/watch", "/play/watch").replace("/?url", ".php?url");
  }
  vt = vt + "&ts=" + ts + "&sig=" + sig + "&exten=true";
  vt = vt.replace("netmirror.hair", "spedostream2.shop");
  return vt.replace(/&amp;/g, '&');
}

// Generate signed TV Series Player URL
function generateSeriesPlayerUrl(subjectId, title, dp, seasonNum, episodeNum) {
  if (!subjectId || !dp) return '';
  const ts = Math.floor(Date.now() / 1000);
  const sig = getSignature(ts);
  const na = encodeURIComponent(Buffer.from(title || '', 'utf8').toString('base64'));
  let vt = `https://spedostream2.shop/play/watchbox.php?id=${subjectId}&se=${seasonNum}&ep=${episodeNum}&dp=${dp}&na=${na}`;
  vt = vt + "&ts=" + ts + "&sig=" + sig + "&exten=true";
  return vt;
}

// Map NetMirror results to client structure
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

// Reverse Proxy for NetMirror Video Player to bypass Referer checks
app.get('/api/player-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send('URL query parameter is required');
    }

    console.log(`Proxying player request for: ${url}`);

    const response = await fetchWithRetry(url, {
      headers: {
        'Referer': 'https://netmirror.global/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Proxy error: ${response.statusText}`);
    }

    let html = await response.text();

    // Inject <base> tag to correctly load relative styles, scripts, and media files
    const parsedUrl = new URL(url);
    const baseHref = `${parsedUrl.protocol}//${parsedUrl.host}/play/`;
    html = html.replace(/<head>/i, `<head><base href="${baseHref}">`);

    // Force extension status to true in player script checks
    html = html.replace(/params\.get\(['"]exten['"]\)/g, '"true"');

    // Fix resolution switching by making play_url return the url directly
    html = html.replace('function play_url(play_url,ext=0){', 'function play_url(play_url,ext=0){ return play_url; ');

    const extraStyles = `
      <style>
        html,
        body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
        }
        .popup-window-ext, .if_ext, .server {
          display: none !important;
        }
        .artplayer-app,
        .art-video-player,
        .art-video {
            width: 100vw !important;
            height: 100vh !important;
            min-height: 100vh !important;
            max-height: 100vh !important;
            overflow: hidden !important;
        }
        @media only screen and (max-width: 768px) {
            .artplayer-app,
            .art-video-player,
            .art-video {
                height: 100dvh !important;
            }
            .art-video {
                object-fit: fill !important;
            }
        }
        .art-video-player {
            display: flex !important;
            flex-direction: column !important;
        }
        .art-video {
            flex: 1 !important;
            min-height: 0 !important;
            height: 60% !important;
        }
        .art-bottom {
            padding-bottom: 0 !important;
            margin-bottom: 0 !important;
            height: auto !important;
            overflow: hidden !important;
        }
      </style>
    `;
    html = html.replace('</head>', `${extraStyles}</head>`);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Proxy request failed:', error.message);
    res.status(500).send(`Proxy error: ${error.message}`);
  }
});

// 1. Get movies / list / category
app.get('/api/movies', async (req, res) => {
  try {
    const { page = 1, category } = req.query;
    const pageIndex = Math.max(0, parseInt(page) - 1);
    const db = readDatabase();
    
    let filtered = db.movies;
    if (category && category !== 'home') {
      filtered = db.movies.filter(m => m.category === category);
    }
    
    // Paginate results (24 per page)
    const paginated = filtered.slice(pageIndex * 24, (pageIndex + 1) * 24);

    res.json({
      success: true,
      page: parseInt(page),
      category: category || 'home',
      count: filtered.length,
      data: paginated
    });
  } catch (error) {
    console.error('Error in /api/movies:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Search movies
app.get('/api/search', async (req, res) => {
  try {
    const { query, page = 1 } = req.query;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query parameter is required' });
    }
    const pageIndex = Math.max(0, parseInt(page) - 1);
    const db = readDatabase();
    
    const filtered = db.movies.filter(movie => 
      movie.title.toLowerCase().includes(query.toLowerCase())
    );
    
    const paginated = filtered.slice(pageIndex * 24, (pageIndex + 1) * 24);
    
    res.json({
      success: true,
      query,
      count: filtered.length,
      data: paginated
    });
  } catch (error) {
    console.error('Error in search:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/search', async (req, res) => {
  try {
    const query = req.body.query || req.query.query;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query parameter is required' });
    }
    const db = readDatabase();
    const filtered = db.movies.filter(movie => 
      movie.title.toLowerCase().includes(query.toLowerCase())
    );
    const paginated = filtered.slice(0, 24);
    
    res.json({
      success: true,
      query,
      count: filtered.length,
      data: paginated
    });
  } catch (error) {
    console.error('Error in search:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Get categories
app.get('/api/categories', (req, res) => {
  res.json({
    success: true,
    count: CATEGORIES.length,
    data: CATEGORIES.map(c => ({ name: c.name, slug: c.slug }))
  });
});

// 4. Get movie details by slug (slug format: media_type-id)
app.get('/api/movie/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const parts = slug.split('-');
    if (parts.length < 2) {
      return res.status(400).json({ success: false, error: 'Invalid slug format. Use media_type-id.' });
    }

    const mediaType = parts[0]; // 'movie' or 'tv'
    const id = parts[1];

    const url = `${API_BASE_3}/${mediaType}/${id}`;
    console.log(`Fetching detail from NetMirror: ${url}`);

    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(`NetMirror details failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return res.status(404).json({ success: false, error: 'Movie/Series not found' });
    }

    const item = data.results[0];
    let poster = item.backdrop_path || '';
    if (poster) {
      poster = poster.replace('pbcdnw', 'pacdn');
    }

    // Prepare seasons structure if tv
    const seasons = item.season || [];

    // Construct default player URL proxied locally
    let videoUrl = '';
    if (mediaType === 'movie' && item.embed) {
      const rawUrl = generateMoviePlayerUrl(item.embed, item.embed_en);
      videoUrl = `/api/player-proxy?url=${encodeURIComponent(rawUrl)}`;
    } else {
      const defaultSeason = (seasons && seasons.length > 0) ? seasons[0].se : 0;
      const defaultEpisode = (seasons && seasons.length > 0) ? 1 : 0;
      const rawUrl = generateSeriesPlayerUrl(item.subjectid, item.title, item.dp, defaultSeason, defaultEpisode);
      videoUrl = `/api/player-proxy?url=${encodeURIComponent(rawUrl)}`;
    }

    res.json({
      success: true,
      data: {
        title: (item.title || '').trim(),
        slug: slug,
        url: `https://netmirror.global/${mediaType}/${id}`,
        poster: poster,
        description: item.dis || 'No plot details parsed for this title.',
        videoUrl: videoUrl,
        media_type: mediaType,
        seasons: seasons,
        subjectid: item.subjectid || null,
        dp: item.dp || null,
        release_date: item.release_date || '',
        vote_average: item.vote_average || '0',
        country: item.country || '',
        trailer: item.trailer || null
      }
    });
  } catch (error) {
    console.error('Error in details:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Dynamic signed player URL (for switching season/episode)
app.get('/api/movie/:slug/player', async (req, res) => {
  try {
    const { slug } = req.params;
    const { se = 1, ep = 1 } = req.query;
    const parts = slug.split('-');
    if (parts.length < 2) {
      return res.status(400).json({ success: false, error: 'Invalid slug format.' });
    }

    const mediaType = parts[0];
    const id = parts[1];

    const url = `${API_BASE_3}/${mediaType}/${id}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(`NetMirror details failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const item = data.results[0];
    let videoUrl = '';
    if (mediaType === 'movie' && item.embed) {
      const rawUrl = generateMoviePlayerUrl(item.embed, item.embed_en);
      videoUrl = `/api/player-proxy?url=${encodeURIComponent(rawUrl)}`;
    } else {
      const rawUrl = generateSeriesPlayerUrl(item.subjectid, item.title, item.dp, se, ep);
      videoUrl = `/api/player-proxy?url=${encodeURIComponent(rawUrl)}`;
    }

    res.json({
      success: true,
      videoUrl
    });
  } catch (error) {
    console.error('Error in /api/movie/:slug/player:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Get related/dubbed versions by title
app.get('/api/movie/:slug/related', async (req, res) => {
  try {
    const { title } = req.query;
    if (!title) {
      return res.status(400).json({ success: false, error: 'Title query parameter is required.' });
    }
    const url = `${API_BASE_4}/related/${encodeURIComponent(title)}?page=0`;
    console.log(`Fetching related titles from NetMirror: ${url}`);
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(`NetMirror related titles failed: ${response.status}`);
    }
    const data = await response.json();
    const mapped = mapMovieResults(data.results);
    res.json({
      success: true,
      data: mapped
    });
  } catch (error) {
    console.error('Error in /api/movie/:slug/related:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scraper Trigger Endpoint (optional manual run)
app.post('/api/scrape/run', async (req, res) => {
  try {
    const result = await runScraper();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Setup 24-hour interval for automatic scraping
const SCRAPE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
setInterval(() => {
  console.log('[Scheduler] Running scheduled scraper pass...');
  runScraper().catch(err => console.error('[Scheduler] Scheduled scraping error:', err.message));
}, SCRAPE_INTERVAL);

// Initial scraper execution if database is empty on start
const initialDb = readDatabase();
if (initialDb.movies.length === 0) {
  console.log('[Scheduler] Local database is empty. Initiating sync...');
  runScraper().catch(err => console.error('[Scheduler] Initial scraping sync failed:', err.message));
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
