const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('[DNS] Failed to set custom DNS servers:', e.message);
}
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

async function test() {
  const uri = process.env.MONGODB_URI;
  console.log('Testing URI:', uri.replace(/:([^@]+)@/, ':****@'));
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Successfully connected to MongoDB!');
    const db = client.db();
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.close();
  }
}
test();
