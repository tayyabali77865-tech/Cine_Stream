require('dotenv').config({ path: '.env.local' });
const { clientPromise } = require('../lib/mongodb');

async function main() {
  try {
    console.log('Using MONGODB_URI:', (process.env.MONGODB_URI || 'default localhost').replace(/:([^@]+)@/, ':****@'));
    const client = await clientPromise;
    const db = client.db();
    const countAll = await db.collection('movies').countDocuments();
    console.log('Total movies in DB:', countAll);

    const categories = ['trending', 'bollywood', 'south-hindi', 'hollywood', 'anime', 'k-drama', 'c-drama', 'reality-tv', 'action', 'romance', 'horror'];
    for (const cat of categories) {
      const count = await db.collection('movies').countDocuments({
        $or: [{ category: cat }, { categories: cat }]
      });
      console.log(`Category [${cat}]: ${count}`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

main();
