const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('[DNS] Failed to set custom DNS servers:', e.message);
}
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cinestream';
const options = {};

let client;
let clientPromise;

async function initDb(clientInstance) {
  try {
    const db = clientInstance.db();
    const movies = db.collection('movies');
    // Create necessary indexes for search and sorting performance
    await movies.createIndex({ slug: 1 }, { unique: true });
    await movies.createIndex({ title: "text" });
    await movies.createIndex({ category: 1, scrapedAt: -1 });
    await movies.createIndex({ scrapedAt: -1 });
    console.log('[MongoDB] Indexes created/verified successfully.');
  } catch (err) {
    console.error('[MongoDB] Error creating indexes:', err.message);
  }
  return clientInstance;
}

if (process.env.NODE_ENV === 'development' || (!process.env.VERCEL && !process.env.NETLIFY)) {
  // In development/local mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR.
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect().then(initDb);
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode (Vercel serverless), do not use global.
  client = new MongoClient(uri, options);
  clientPromise = client.connect().then(initDb);
}

// Database Logger helper
async function dbLog(type, message, details = null) {
  try {
    const dbClient = await clientPromise;
    const db = dbClient.db();
    await db.collection('logs').insertOne({
      timestamp: new Date(),
      type,
      message,
      details: details ? (typeof details === 'object' ? JSON.parse(JSON.stringify(details)) : { raw: String(details) }) : null
    });
    console.log(`[DB Log - ${type.toUpperCase()}] ${message}`);
  } catch (err) {
    console.error(`[Logger Error] Failed to write log to MongoDB:`, err.message);
  }
}

module.exports = {
  clientPromise,
  dbLog
};
