// scripts/check-count.js
require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

(async () => {
  const c = await MongoClient.connect(process.env.MONGO_URL);
  const d = c.db(process.env.MONGO_DB);

  const total = await d.collection('services_by_ymm').countDocuments();
  const withSvcs = await d.collection('services_by_ymm').countDocuments({ 'services.0': { $exists: true } });
  console.log({ db: process.env.MONGO_DB, total, withSvcs });

  const doc = await d.collection('services_by_ymm').findOne({ _id: '1990|Acura|Integra' });
  console.log('peek _id:', doc?._id);
  console.log('services length:', Array.isArray(doc?.services) ? doc.services.length : 0);
  if (doc?.services?.length) console.dir(doc.services[0], { depth: 5 });

  await c.close();
})();
