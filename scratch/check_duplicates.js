require('dotenv').config({ path: '.env.local' });
const { clientPromise } = require('../lib/mongodb');

async function main() {
  try {
    const client = await clientPromise;
    const db = client.db();
    const moviesCollection = db.collection('movies');

    // Aggregate to find duplicate titles
    const duplicates = await moviesCollection.aggregate([
      {
        $group: {
          _id: { $toLower: "$title" },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
          slugs: { $push: "$slug" }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]).toArray();

    console.log(`Found ${duplicates.length} duplicate groups.`);

    let totalDeleted = 0;
    for (const group of duplicates) {
      console.log(`Duplicate Title: "${group._id}" (Count: ${group.count})`);
      console.log(`  Slugs: ${JSON.stringify(group.slugs)}`);
      
      // Keep the first document, delete the rest
      const [keepId, ...deleteIds] = group.ids;
      for (const delId of deleteIds) {
        const res = await moviesCollection.deleteOne({ _id: delId });
        totalDeleted += res.deletedCount;
      }
    }

    console.log(`Successfully deleted ${totalDeleted} duplicate movie records from DB.`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

main();
