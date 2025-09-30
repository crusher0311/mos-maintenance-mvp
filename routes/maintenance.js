// routes/maintenance.js
const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

router.get('/', async (req, res) => {
  const { year, make, model } = req.query;
  if (!year || !make || !model) {
    return res.status(400).json({ error: 'year, make, and model are required query params' });
  }

  const y = parseInt(year, 10);
  if (!Number.isFinite(y)) return res.status(400).json({ error: 'year must be a number' });

  const makeKey = key(make);
  const modelKey = key(model);
  const id = `${y}|${make}|${model}`;

  let client;
  try {
    client = await MongoClient.connect(process.env.MONGO_URL);
    const db = client.db(process.env.MONGO_DB);
    const col = db.collection('services_by_ymm');

    // 1) Fast path (if you ran add-ymm-indexes.js)
    let doc = await col.findOne({ year: y, make_key: makeKey, model_key: modelKey });

    // 2) Fallback: exact _id
    if (!doc) doc = await col.findOne({ _id: id });

    // 3) Fallback: forgiving match on raw fields
    if (!doc) {
      doc = await col.findOne({
        year: y,
        $expr: {
          $and: [
            { $eq: [ { $replaceAll: { input: { $toLower: "$make" }, find: /[^a-z0-9]/g, replacement: "" } }, makeKey ] },
            { $eq: [ { $replaceAll: { input: { $toLower: "$model" }, find: /[^a-z0-9]/g, replacement: "" } }, modelKey ] }
          ]
        }
      });
    }

    if (!doc) return res.status(404).json({ error: 'Not found' });

    return res.json({
      year: doc.year,
      make: doc.make,
      model: doc.model,
      services: doc.services
    });
  } catch (err) {
    console.error('GET /api/maintenance error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
});

module.exports = router;
