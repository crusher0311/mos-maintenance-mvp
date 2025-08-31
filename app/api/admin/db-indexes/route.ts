import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/db-indexes
 * Header required: X-Admin-Token
 *
 * Idempotent setup:
 * - shops.shopId unique
 * - shops.credentials.autoflow.apiKey sparse
 * - counters.shopId = max(existing numeric shopId)
 * - setup_tokens.token unique + TTL(expiresAt)
 * - users {shopId, emailLower} unique
 * - sessions.token unique + TTL(expiresAt)
 */
export async function POST(req: NextRequest) {
  const admin = req.headers.get("x-admin-token");
  if (!admin) return NextResponse.json({ error: "Missing X-Admin-Token" }, { status: 401 });

  try {
    const db = await getDb();
    const shops = db.collection("shops");
    const counters = db.collection("counters");
    const setupTokens = db.collection("setup_tokens");
    const users = db.collection("users");
    const sessions = db.collection("sessions");

    // shops
    await shops.createIndex({ shopId: 1 }, { unique: true, name: "shopId_unique" });
    await shops.createIndex(
      { "credentials.autoflow.apiKey": 1 },
      { name: "autoflow_apiKey_idx", sparse: true }
    );

    // counters alignment
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

    // setup_tokens
    await setupTokens.createIndex({ token: 1 }, { unique: true, name: "setup_token_unique" });
    await setupTokens.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "setup_token_ttl" }
    );

    // users: one email per shop
    await users.createIndex(
      { shopId: 1, emailLower: 1 },
      { unique: true, name: "user_unique_per_shop" }
    );

    // sessions: unique token + TTL
    await sessions.createIndex({ token: 1 }, { unique: true, name: "session_token_unique" });
    await sessions.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "session_ttl" }
    );

    const counterNow = await counters.findOne({ _id: "shopId" });
    return NextResponse.json({
      ok: true,
      indexes: [
        "shops.shopId (unique)",
        "shops.credentials.autoflow.apiKey (sparse)",
        "setup_tokens.token (unique)",
        "setup_tokens.expiresAt (TTL)",
        "users {shopId,emailLower} (unique)",
        "sessions.token (unique)",
        "sessions.expiresAt (TTL)",
      ],
      counter: counterNow,
      maxExisting,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
