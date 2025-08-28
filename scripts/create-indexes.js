// scripts/create-indexes.js
require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

(async () => {
  const url = process.env.MONGO_URL;
  const dbName = process.env.MONGO_DB;
  if (!url || !dbName) {
    console.error('Missing MONGO_URL or MONGO_DB in .env.local');
    process.exit(1);
  }

  const client = await MongoClient.connect(url);
  try {
    const db = client.db(dbName);
    const col = db.collection('services_by_ymm');

    // Define the indexes you want. Name the compound YMM index the same as
    // the one you already have to avoid conflicts.
    const desired = [
      { key: { year: 1, make_key: 1, model_key: 1 }, name: 'ymm_search' },
      // NOTE: _id index exists by default; don't try to recreate it.
      // Add more indexes here if needed.
    ];

    const existing = await col.indexes();

    const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    for (const want of desired) {
      const hit = existing.find(ix => sameKey(ix.key, want.key));
      if (hit) {
        console.log(`Index with same keys already exists: ${hit.name} (keeping as-is)`);
        continue;
      }
      await col.createIndex(want.key, { name: want.name });
      console.log(`Created index: ${want.name}`);
    }

    console.log('Indexes ensured ✅');
  } catch (err) {
    console.error('Index creation failed:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
