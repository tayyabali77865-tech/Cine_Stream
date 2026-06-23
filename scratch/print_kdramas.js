require('dotenv').config({ path: '.env.local' });
const { clientPromise } = require('../lib/mongodb');

async function main() {
  try {
    const client = await clientPromise;
    const db = client.db();
    const kdramas = await db.collection('movies').find({
      $or: [{ category: 'k-drama' }, { categories: 'k-drama' }]
    }).toArray();
    console.log(`Found ${kdramas.length} dramas:`);
    kdramas.forEach(m => {
      console.log(`- ${m.title} (slug: ${m.slug}) | category: ${m.category} | categories: ${JSON.stringify(m.categories)}`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

main();
