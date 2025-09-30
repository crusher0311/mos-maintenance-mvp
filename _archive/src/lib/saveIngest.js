// src/lib/saveIngest.js
import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";

let _indexesReady = false;

async function ensureIndexes(db) {
  if (_indexesReady) return;
  await Promise.all([
    db.collection("odometerpoints").createIndexes([
      { key: { shopId: 1, vin: 1, date: 1, mileage: 1 }, unique: true, name: "uniq_shop_vin_date_mileage" },
      { key: { shopId: 1, vin: 1, mileage: -1 }, name: "lookup_latest_mileage" },
    ]),
    db.collection("serviceevents").createIndexes([
      { key: { shopId: 1, vin: 1, date: 1, mileage: 1, description: 1 }, unique: true, name: "uniq_shop_vin_date_mi_desc" },
      { key: { shopId: 1, vin: 1, date: -1 }, name: "lookup_events_by_date" },
    ]),
    db.collection("oeschedules").createIndexes([
      { key: { shopId: 1, vin: 1 }, name: "by_shop_vin" },
      { key: { shopId: 1, vin: 1, serviceCode: 1 }, name: "by_service_code" },
    ]),
  ]);
  _indexesReady = true;
}

/** Defensive converters */
function toISO(d) {
  if (!d) return null;
  try {
    const t = new Date(d);
    return Number.isNaN(+t) ? null : t.toISOString();
  } catch {
    return null;
  }
}

function toMiles(m) {
  const n = Number(m);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function oid(x) {
  try {
    return typeof x === "string" ? new ObjectId(x) : x;
  } catch {
    return null;
  }
}

/**
 * Upsert odometer points
 * @param {string|ObjectId} shopId
 * @param {string} vin
 * @param {Array<{vin,date,mileage,source}>} points
 * @returns {{inserted:number, upserted:number, skipped:number}}
 */
export async function upsertOdometers(shopId, vin, points = []) {
  if (!shopId || !vin) return { inserted: 0, upserted: 0, skipped: points.length };

  const client = await clientPromise;
  const db = client.db();
  await ensureIndexes(db);

  const col = db.collection("odometerpoints");
  let inserted = 0, upserted = 0, skipped = 0;

  for (const p of points) {
    const dateISO = toISO(p.date);
    const mileage = toMiles(p.mileage);
    if (mileage == null) { skipped++; continue; }

    try {
      const res = await col.updateOne(
        { shopId: oid(shopId), vin, date: dateISO, mileage },
        {
          $setOnInsert: { createdAt: new Date() },
          $set: { source: p.source || "carfax", updatedAt: new Date() },
        },
        { upsert: true }
      );
      if (res.upsertedCount === 1) inserted++;
      else if (res.matchedCount === 1 && res.modifiedCount === 1) upserted++;
      else skipped++;
    } catch (e) {
      // Ignore duplicate errors due to race; count as skipped
      if (!String(e?.message).includes("E11000")) {
        // eslint-disable-next-line no-console
        console.warn("upsertOdometers warn:", e?.message);
      }
      skipped++;
    }
  }

  return { inserted, upserted, skipped };
}

/**
 * Upsert service events
 * @param {string|ObjectId} shopId
 * @param {string} vin
 * @param {Array<{vin,date,mileage,description,vendorName,source}>} events
 * @returns {{inserted:number, upserted:number, skipped:number}}
 */
export async function upsertServiceEvents(shopId, vin, events = []) {
  if (!shopId || !vin) return { inserted: 0, upserted: 0, skipped: events.length };

  const client = await clientPromise;
  const db = client.db();
  await ensureIndexes(db);

  const col = db.collection("serviceevents");
  let inserted = 0, upserted = 0, skipped = 0;

  for (const ev of events) {
    const dateISO = toISO(ev.date);
    const mileage = ev.mileage != null ? toMiles(ev.mileage) : null;
    const desc = (ev.description || "Service Event").toString().slice(0, 512);
    const vendor = ev.vendorName ? String(ev.vendorName).slice(0, 256) : null;

    try {
      const res = await col.updateOne(
        { shopId: oid(shopId), vin, date: dateISO, mileage, description: desc },
        {
          $setOnInsert: { createdAt: new Date() },
          $set: { vendorName: vendor, source: ev.source || "carfax", updatedAt: new Date() },
        },
        { upsert: true }
      );
      if (res.upsertedCount === 1) inserted++;
      else if (res.matchedCount === 1 && res.modifiedCount === 1) upserted++;
      else skipped++;
    } catch (e) {
      if (!String(e?.message).includes("E11000")) {
        // eslint-disable-next-line no-console
        console.warn("upsertServiceEvents warn:", e?.message);
      }
      skipped++;
    }
  }

  return { inserted, upserted, skipped };
}

/**
 * Replace the OE schedule for a (shopId, vin)
 * @param {string|ObjectId} shopId
 * @param {string} vin
 * @param {Array<{vin,serviceCode,title,intervalMiles,intervalMonths,notes,source}>} items
 * @returns {{replaced:number}}
 */
export async function saveOeSchedule(shopId, vin, items = []) {
  if (!shopId || !vin) return { replaced: 0 };

  const client = await clientPromise;
  const db = client.db();
  await ensureIndexes(db);

  const col = db.collection("oeschedules");
  const shop = oid(shopId);

  // Remove previous schedule for this shop+vin
  await col.deleteMany({ shopId: shop, vin });

  if (!Array.isArray(items) || items.length === 0) return { replaced: 0 };

  const docs = items.map((it) => ({
    shopId: shop,
    vin,
    serviceCode: String(it.serviceCode || it.title || "SERVICE"),
    title: String(it.title || "Service"),
    intervalMiles: toMiles(it.intervalMiles),
    intervalMonths: Number.isFinite(Number(it.intervalMonths)) ? Number(it.intervalMonths) : null,
    notes: it.notes || null,
    source: it.source || "oe",
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const res = await col.insertMany(docs, { ordered: false });
  return { replaced: res.insertedCount || docs.length };
}

export default {
  upsertOdometers,
  upsertServiceEvents,
  saveOeSchedule,
};
