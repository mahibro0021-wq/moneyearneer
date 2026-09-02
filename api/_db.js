const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI env var not set');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('dailymoney');
  cachedClient = client;
  cachedDb = db;
  return db;
}

module.exports = { connectToDatabase };
