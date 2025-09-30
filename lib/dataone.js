// lib/dataone.js
const { MongoClient } = require("mongodb");

function toSquish(v){ v=String(v).toUpperCase().trim(); if(v.length!==17) throw new Error("VIN must be 17 chars"); return v.slice(0,8)+v.slice(9,11); }

async function getMaintenanceSummaryByVin(mongoUri, dbName, vin) {
  const squish = toSquish(vin);
  const client = new MongoClient(mongoUri);
  await client.connect();
  try {
    const db = client.db(dbName);
    return await db.collection("dataone_vin_maintenance_summary")
      .find({ squish })
      .sort({ category: 1, name: 1 })
      .toArray();
  } finally {
    await client.close();
  }
}

module.exports = { getMaintenanceSummaryByVin, toSquish };
