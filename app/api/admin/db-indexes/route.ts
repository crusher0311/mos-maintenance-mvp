import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/db-indexes
 * Header required: X-Admin-Token
 *
 * Idempotent setup:
 * 1) Ensure unique index on shops.shopId
 * 2) Ensure (optional) index on credentials.autoflow.apiKey
 * 3) Set counters.shopId.seq = max(existing numeric shopId) so the next created shop gets max+1
 * 4) Ensure setup_tokens indexes (unique token + TTL on expiresAt)
 */
export async function POST(req: NextRequest) {
  const admin = req.headers.get("x-admin-token");
  if (!admin) {
    return NextResponse.json({ error: "Missing X-Admin-Token" }, { status: 401 });
  }

  try {
    const db = await getDb();
    const shops = db.collection("shops");
    const counters = db.collection("counters");
    const setupTokens = db.collection("setup_tokens");

    // 1) Unique index on numeric shopId
    await shops.createIndex({ shopId: 1 }, { unique: true, name: "shopId_unique" });

    // 2) Helpful provider lookup index (not unique)
    await shops.createIndex(
      { "credentials.autoflow.apiKey": 1 },
      { name: "autoflow_apiKey_idx", sparse: true }
    );

    // 3) Compute current max numeric shopId and align counter
    const maxDoc = await shops
      .find({ shopId: { $type: "number" } }, { projection: { shopId: 1 } })
      .sort({ shopId: -1 })
      .limit(1)
      .next();

    const maxExisting = Number.isFinite(maxDoc?.shopId) ? (maxDoc!.shopId as number) : 0;

    await counters.updateOne(
      { _id: "shopId" },
      { $set: { seq: maxExisting }, $setOnInsert: { _id: "shopId" } },
      { upsert: true }
    );

    // 4) setup_tokens indexes: unique token + TTL on expiresAt
    await setupTokens.createIndex({ token: 1 }, { unique: true, name: "setup_token_unique" });
    // TTL: docs auto-delete when expiresAt < now (Atlas TTL monitor handles this)
    await setupTokens.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "setup_token_ttl" }
    );

    const counterNow = await counters.findOne({ _id: "shopId" });
    return NextResponse.json({
      ok: true,
      indexes: [
        "shops.shopId (unique)",
        "shops.credentials.autoflow.apiKey (sparse)",
        "setup_tokens.token (unique)",
        "setup_tokens.expiresAt (TTL)",
      ],
      counter: counterNow,
      maxExisting,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
