import { NextRequest } from "next/server";
import { getMongo } from "@/lib/mongo";

/**
 * POST /api/autoflow/sync
 * Body: { shopId?: string, vins: string[], ttlSeconds?: number }
 * - Upserts provided VINs into af_open with a heartbeat TTL.
 * - Deletes any other VINs for that shop not in the list.
 * - TTL cleans up if sync stops.
 */
export async function POST(req: NextRequest) {
  const client = await getMongo();
  const db = client.db();
  const coll = db.collection("af_open");

  // Idempotent indexes
  await coll.createIndex({ shopId: 1, vin: 1 }, { unique: true });
  await coll.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  let body: any = {};
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const shopId = String(body?.shopId ?? "default").trim();
  const vins = Array.isArray(body?.vins) ? body.vins.map((v: any) => String(v).trim()).filter(Boolean) : [];
  const ttlSeconds = Number.isFinite(body?.ttlSeconds) ? Math.max(60, Math.min(3600, Number(body.ttlSeconds))) : 900; // default 15m

  if (vins.length === 0) {
    const del = await coll.deleteMany({ shopId });
    return Response.json({ ok: true, shopId, updated: 0, removed: del.deletedCount ?? 0 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  // Upsert all provided VINs
  const ops = vins.map((vin: string) => ({
    updateOne: {
      filter: { shopId, vin },
      update: {
        $set: { shopId, vin, updatedAt: now, expiresAt },
        $setOnInsert: { createdAt: now },
      },
      upsert: true,
    },
  }));
  const bulk = await coll.bulkWrite(ops, { ordered: false });

  // Remove anything not in this snapshot
  const remove = await coll.deleteMany({ shopId, vin: { $nin: vins } });

  return Response.json({
    ok: true,
    shopId,
    updated: (bulk.upsertedCount ?? 0) + (bulk.modifiedCount ?? 0),
    removed: remove.deletedCount ?? 0,
    ttlSeconds,
  });
}
