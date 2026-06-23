require('dotenv').config({ path: '.env.local' });
const { clientPromise } = require('../lib/mongodb');

async function main() {
  try {
    const client = await clientPromise;
    const adminDb = client.db().admin();
    const dbs = await adminDb.listDatabases();
    console.log('Databases:');
    for (const dbInfo of dbs.databases) {
      console.log(`- ${dbInfo.name} (${dbInfo.sizeOnDisk} bytes)`);
      const db = client.db(dbInfo.name);
      const cols = await db.listCollections().toArray();
      for (const col of cols) {
        const count = await db.collection(col.name).countDocuments();
        console.log(`  * ${col.name}: ${count} docs`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

main();
