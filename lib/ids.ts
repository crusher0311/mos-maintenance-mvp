// lib/ids.ts
import { getDb } from "@/lib/mongo";

/**
 * Atomically increments and returns the next numeric shopId.
 * We’ll initialize the counter separately (see the admin route).
 */
export async function getNextShopId(): Promise<number> {
  const db = await getDb();
  const r = await db.collection("counters").findOneAndUpdate(
    { _id: "shopId" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return r?.value?.seq ?? 1;
}
