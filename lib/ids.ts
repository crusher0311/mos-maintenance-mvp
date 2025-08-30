// lib/ids.ts
import { getDb } from "@/lib/mongo";

/**
 * Atomically increments and returns the next numeric shopId (1,2,3,...).
 * Robust across Mongo driver versions. Never returns undefined.
 */
export async function getNextShopId(): Promise<number> {
  const db = await getDb();
  const counters = db.collection("counters");

  // Ensure counter doc exists with a numeric seq (seed at 0 so first next = 1)
  await counters.updateOne(
    { _id: "shopId" },
    { $setOnInsert: { _id: "shopId", seq: 0 } },
    { upsert: true }
  );

  // Try (v4+) returnDocument: "after"
  let res: any = await counters.findOneAndUpdate(
    { _id: "shopId" },
    { $inc: { seq: 1 }, $setOnInsert: { seq: 0 } },
    { upsert: true, returnDocument: "after" as any }
  );
  let seq: any = res?.value?.seq;

  // Fallback (v3.x) returnOriginal: false
  if (!Number.isFinite(seq)) {
    res = await (counters as any).findOneAndUpdate(
      { _id: "shopId" },
      { $inc: { seq: 1 }, $setOnInsert: { seq: 0 } },
      { upsert: true, returnOriginal: false }
    );
    seq = res?.value?.seq;
  }

  // Last-resort: two-step (still atomic on the $inc)
  if (!Number.isFinite(seq)) {
    await counters.updateOne({ _id: "shopId" }, { $inc: { seq: 1 } }, { upsert: true });
    const doc = await counters.findOne({ _id: "shopId" });
    seq = doc?.seq;
  }

  if (!Number.isFinite(seq)) {
    throw new Error("Counter not initialized correctly");
  }
  return seq as number;
}
