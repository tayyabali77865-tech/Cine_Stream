require('dotenv').config({ path: '.env.local' });
const { clientPromise } = require('../lib/mongodb');

const API_BASE_3 = 'https://api2.imdb3.shop/api';

async function main() {
  try {
    const client = await clientPromise;
    const db = client.db();
    const moviesCollection = db.collection('movies');

    const cat = { name: "K-Drama", slug: "k-drama", id: 18 };

    for (let pageNum = 0; pageNum <= 10; pageNum++) {
      const url = `${API_BASE_3}/tranding?id=${cat.id}&page=${pageNum}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
        console.log(`No results on page ${pageNum}`);
        break;
      }

      console.log(`Page ${pageNum} has ${data.results.length} results`);

      for (const item of data.results) {
        const slug = `${item.media_type || 'movie'}-${item.id}`;
        const exists = await moviesCollection.findOne({ slug });

        if (!exists) {
          const movieDoc = {
            title: (item.title || '').trim(),
            url: `https://netmirror.global/${item.media_type || 'movie'}/${item.id}`,
            slug: slug,
            poster: item.backdrop_path || '',
            media_type: item.media_type || 'movie',
            release_date: item.release_date || '',
            vote_average: item.vote_average || '0',
            category: cat.slug,
            categories: [cat.slug],
            isIndian: false,
            scrapedAt: new Date()
          };
          const res = await moviesCollection.insertOne(movieDoc);
          console.log(`  [INSERTED] ${movieDoc.title} | ID: ${res.insertedId}`);
        } else {
          const res = await moviesCollection.updateOne(
            { slug },
            { 
              $addToSet: { categories: cat.slug },
              $set: { isIndian: false }
            }
          );
          console.log(`  [EXISTS/UPDATED] ${item.title} | Modified: ${res.modifiedCount} | Matched: ${res.matchedCount}`);
        }
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

main();
