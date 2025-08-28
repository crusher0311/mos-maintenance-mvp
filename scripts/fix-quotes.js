// scripts/fix-quotes.js
require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

const clean = (v) => {
  if (v == null) return v;
  let s = String(v).trim();
  // remove a single layer of surrounding quotes
  s = s.replace(/^"+(.*)"+$/s, '$1');
  // collapse doubled quotes to single quotes
  s = s.replace(/""/g, '"');
  // normalize whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s === '' ? undefined : s;
};

const cleanService = (svc) => ({
  ...svc,
  category: clean(svc.category),
  name: clean(svc.name),
  notes: clean(svc.notes),
  schedule: svc.schedule ? {
    name: clean(svc.schedule.name),
    description: clean(svc.schedule.description)
  } : undefined,
  intervals: Array.isArray(svc.intervals) ? svc.intervals.map(i => ({
    type: clean(i.type),
    value: i.value,
    units: clean(i.units),
    initial: i.initial
  })) : [],
  operating_parameters: Array.isArray(svc.operating_parameters) ? svc.operating_parameters.map(p => ({
    name: clean(p.name),
    notes: clean(p.notes)
  })) : [],
  computer_codes: Array.isArray(svc.computer_codes) ? svc.computer_codes.map(clean) : [],
  events: Array.isArray(svc.events) ? svc.events.map(clean) : [],
  eng_notes: clean(svc.eng_notes),
  trans_notes: clean(svc.trans_notes),
  trim_notes: clean(svc.trim_notes),
});

(async () => {
  const client = await MongoClient.connect(process.env.MONGO_URL);
  const db = client.db(process.env.MONGO_DB);
  const col = db.collection('services_by_ymm');

  const cursor = col.find(
    { services: { $type: 'array', $ne: [] } },
    { projection: { _id: 1, services: 1 } }
  ).batchSize(100);

  const ops = [];
  let touched = 0;

  for await (const doc of cursor) {
    const cleaned = doc.services.map(cleanService);

    // quick shallow check to avoid unnecessary writes
    const changed = cleaned.some((s, i) =>
      s.name !== doc.services[i]?.name ||
      s.category !== doc.services[i]?.category ||
      s.notes !== doc.services[i]?.notes
    );

    if (changed) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { services: cleaned } } } });
      if (ops.length >= 500) {
        await col.bulkWrite(ops, { ordered: false });
        ops.length = 0;
      }
      touched++;
    }
  }

  if (ops.length) await col.bulkWrite(ops, { ordered: false });
  console.log('Cleaned docs:', touched);

  await client.close();
})();
