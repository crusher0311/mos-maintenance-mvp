import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/db-indexes
 * Requires header: X-Admin-Token (you already have this in your UI)
 *
 * Actions (idempotent):
 * 1) Ensure unique index on shops.shopId
 * 2) Ensure (optional) index on credentials.autoflow.apiKey
 * 3) Initialize counters.shopId to max(current shopId, 10000)
 */
export async function POST(req: NextRequest) {
  // OPTIONAL: block unless admin header present. If you already enforce this elsewhere, keep or remove.
  const admin = req.headers.get("x-admin-token");
  if (!admin) {
    return NextResponse.json({ error: "Missing X-Admin-Token" }, { status: 401 });
  }

  try {
    const db = await getDb();
    const shops = db.collection("shops");
    const counters = db.collection("counters");

    // 1) Unique index on public numeric shopId
    await shops.createIndex({ shopId: 1 }, { unique: true, name: "shopId_unique" });

    // 2) Helpful for lookups by provider key (not unique)
    await shops.createIndex(
      { "credentials.autoflow.apiKey": 1 },
      { name: "autoflow_apiKey_idx", sparse: true }
    );

    // 3) Initialize the counter: set to max(existing, 10000)
    const maxDoc = await shops
      .find({ shopId: { $type: "number" } }, { projection: { shopId: 1 } })
      .sort({ shopId: -1 })
      .limit(1)
      .next();

    const maxExisting = Number.isFinite(maxDoc?.shopId) ? maxDoc!.shopId : 0;
    const seed = Math.max(10000, maxExisting);

    await counters.updateOne(
      { _id: "shopId" },
      { $setOnInsert: { _id: "shopId", seq: seed } }, // only set on first create
      { upsert: true }
    );

    // Return status
    const counterNow = await counters.findOne({ _id: "shopId" });
    return NextResponse.json({
      ok: true,
      indexes: ["shops.shopId (unique)", "shops.credentials.autoflow.apiKey (sparse)"],
      counter: counterNow,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
