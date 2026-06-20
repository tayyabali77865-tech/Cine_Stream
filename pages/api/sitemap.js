const { clientPromise } = require('../../lib/mongodb');

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml');
  
  let movies = [];
  try {
    const client = await clientPromise;
    const db = client.db();
    movies = await db.collection('movies')
      .find({})
      .sort({ scrapedAt: -1 })
      .limit(1000)
      .toArray();
  } catch (error) {
    console.error('Sitemap DB query error:', error.message);
  }

  const host = req.headers.host || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <priority>1.0</priority>
    <changefreq>daily</changefreq>
  </url>${movies.map(movie => `
  <url>
    <loc>${baseUrl}/movie/${movie.slug}</loc>
    <lastmod>${movie.scrapedAt ? new Date(movie.scrapedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <priority>0.8</priority>
  </url>`).join('')}
</urlset>`;

  res.write(xml);
  res.end();
}
