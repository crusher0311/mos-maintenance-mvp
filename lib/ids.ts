// lib/ids.ts
import { getDb } from "@/lib/mongo";

/**
 * Atomically increments and returns the next numeric shopId.
 * - Ensures the counter exists and is seeded to >= 10000.
 * - Works with MongoDB drivers that use either `returnDocument: "after"` (v4+)
 *   or `returnOriginal: false` (v3).
 * - Never falls back to 1.
 */
export async function getNextShopId(): Promise<number> {
  const db = await getDb();
  const counters = db.collection("counters");

  // Ensure the counter doc exists and is at least 10000
  const existing = await counters.findOne({ _id: "shopId" });
  if (!existing) {
    await counters.insertOne({ _id: "shopId", seq: 10000 });
  } else if (typeof existing.seq !== "number" || existing.seq < 10000) {
    await counters.updateOne({ _id: "shopId" }, { $set: { seq: 10000 } });
  }

  // First try (MongoDB v4+)
  let res: any = await counters.findOneAndUpdate(
    { _id: "shopId" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" as any }
  );
  let seq: any = res?.value?.seq;

  // Fallback for older drivers (v3.x)
  if (!Number.isFinite(seq)) {
    res = await (counters as any).findOneAndUpdate(
      { _id: "shopId" },
      { $inc: { seq: 1 } },
      { upsert: true, returnOriginal: false }
    );
    seq = res?.value?.seq;
  }

  if (!Number.isFinite(seq)) {
    throw new Error("Counter not initialized correctly");
  }

  return seq as number;
}
