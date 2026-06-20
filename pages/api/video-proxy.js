const { Readable } = require('stream');

export default async function handler(req, res) {
  try {
    const { streamUrl } = req.query;
    if (!streamUrl) {
      return res.status(400).send('streamUrl query parameter is required');
    }

    const range = req.headers.range || 'bytes=0-';

    const headers = {
      'User-Agent': req.headers['user-agent'] || '',
      'Referer': 'https://netmirror.global/',
      'Origin': 'https://netmirror.global',
      'Range': range,
    };

    if (req.headers.cookie) {
      headers['Cookie'] = req.headers.cookie;
    }

    const response = await fetch(streamUrl, { headers });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('text/html')) {
      res.setHeader('Content-Type', 'video/mp4');
      return res.status(response.status || 404).end();
    }

    res.writeHead(response.status, {
      'Content-Type': 'video/mp4',
      'Content-Range': response.headers.get('content-range') || '',
      'Accept-Ranges': 'bytes',
      'Content-Length': response.headers.get('content-length') || '',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    });

    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Video proxy error:', error.message);
    res.status(500).end();
  }
}
