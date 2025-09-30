// scripts/peek-one.js
require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

(async () => {
  const client = await MongoClient.connect(process.env.MONGO_URL);
  const db = client.db(process.env.MONGO_DB);

  // Peek a known doc
  const id = '1990|Acura|Integra';
  const doc = await db.collection('services_by_ymm').findOne({ _id: id });

  console.log('peek _id:', doc?._id);
  console.log('services length:', Array.isArray(doc?.services) ? doc.services.length : 0);
  if (doc?.services?.length) {
    console.dir(doc.services[0], { depth: 5 });
  }

  await client.close();
})();
