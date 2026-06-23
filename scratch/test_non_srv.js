const { MongoClient } = require('mongodb');

async function test() {
  const uri = 'mongodb://ia51862561_db_user:Tayyabali7890@ac-ckjeavx-shard-00-00.mbreua3.mongodb.net:27017,ac-ckjeavx-shard-00-01.mbreua3.mongodb.net:27017,ac-ckjeavx-shard-00-02.mbreua3.mongodb.net:27017/cinestream?ssl=true&replicaSet=atlas-mbreua-shard-0&authSource=admin&retryWrites=true&w=majority';
  console.log('Testing non-SRV URI...');
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Successfully connected to MongoDB with non-SRV URI!');
    const db = client.db();
    const count = await db.collection('movies').countDocuments();
    console.log(`Movies count: ${count}`);
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.close();
  }
}
test();
