const crypto = require('crypto');

const API_BASE_3 = 'https://api2.imdb3.shop/api';
const HMAC_KEY = 'net###@@sss';

function getSignature(timestamp) {
  return crypto
    .createHmac('sha256', HMAC_KEY)
    .update(String(timestamp))
    .digest('hex');
}

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

function generateSeriesPlayerUrl(subjectId, title, dp, seasonNum, episodeNum) {
  if (!subjectId || !dp) return '';
  const ts = Math.floor(Date.now() / 1000);
  const sig = getSignature(ts);
  const na = encodeURIComponent(Buffer.from(title || '', 'utf8').toString('base64'));
  let vt = `https://spedostream2.shop/play/watchbox.php?id=${subjectId}&se=${seasonNum}&ep=${episodeNum}&dp=${dp}&na=${na}`;
  vt = vt + "&ts=" + ts + "&sig=" + sig + "&exten=true";
  return vt;
}

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

export default async function handler(req, res) {
  try {
    const { slug, se = 1, ep = 1 } = req.query;
    if (!slug) {
      return res.status(400).json({ success: false, error: 'Slug parameter is required.' });
    }
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

    return res.status(200).json({
      success: true,
      videoUrl
    });
  } catch (error) {
    console.error('Error in dynamic player URL:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
