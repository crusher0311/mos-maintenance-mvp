// scripts/add-ymm-indexes.js
require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

const key = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ''); // letters+digits only (spaces/dashes removed)

(async () => {
  const client = await MongoClient.connect(process.env.MONGO_URL);
  const db = client.db(process.env.MONGO_DB);
  const col = db.collection('services_by_ymm');

  // Add normalized keys to each doc (idempotent)
  const cursor = col.find({}, { projection: { _id: 1, year: 1, make: 1, model: 1 } }).batchSize(500);
  const ops = [];
  let touched = 0;

  for await (const doc of cursor) {
    const make_key = key(doc.make);
    const model_key = key(doc.model);
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { make_key, model_key } } } });
    if (ops.length >= 1000) {
      await col.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
    touched++;
  }
  if (ops.length) await col.bulkWrite(ops, { ordered: false });
  console.log('Updated docs:', touched);

  // Indexes for fast lookups
  await col.createIndex({ year: 1, make_key: 1, model_key: 1 }, { name: 'ymm_search' });
  await col.createIndex({ _id: 1 }, { name: '_id_default' });

  console.log('Indexes ensured.');
  await client.close();
})();
