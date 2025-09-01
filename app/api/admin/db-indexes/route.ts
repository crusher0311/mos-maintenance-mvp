import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// shallow equality for index key specs
function keysEqual(a: Record<string, any>, b: Record<string, any>) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function POST(req: NextRequest) {
  const admin = req.headers.get("x-admin-token");
  if (!admin) return NextResponse.json({ error: "Missing X-Admin-Token" }, { status: 401 });

  const url = new URL(req.url);
  const force =
    url.searchParams.get("force") === "1" || req.headers.get("x-admin-force") === "1";

  try {
    const db = await getDb();
    const shops        = db.collection("shops");
    const counters     = db.collection("counters");
    const setupTokens  = db.collection("setup_tokens");
    const users        = db.collection("users");
    const sessions     = db.collection("sessions");
    const pwresets     = db.collection("password_resets");
    const ratelimits   = db.collection("ratelimits");
    const events       = db.collection("events");

    async function dropConflictingIndex(
      coll: any,
      desiredKeys: Record<string, 1 | -1>,
      desiredName: string
    ) {
      if (!force) return;
      try {
        const list = await coll.listIndexes().toArray();
        for (const idx of list) {
          if (idx.name === desiredName) continue;
          if (idx.key && keysEqual(idx.key, desiredKeys)) {
            await coll.dropIndex(idx.name).catch(() => {});
          }
        }
      } catch {}
    }

    async function ensureIndex(
      coll: any,
      keys: Record<string, 1 | -1>,
      options: any
    ) {
      try {
        await coll.createIndex(keys, options);
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (msg.includes("already exists") || msg.includes("IndexOptionsConflict")) return;
        throw e;
      }
    }

    // ---- shops
    await dropConflictingIndex(shops, { shopId: 1 }, "shopId_unique");
    await ensureIndex(shops, { shopId: 1 }, { unique: true, name: "shopId_unique" });

    await dropConflictingIndex(
      shops,
      { "credentials.autoflow.apiKey": 1 },
      "autoflow_apiKey_idx"
    );
    await ensureIndex(
      shops,
      { "credentials.autoflow.apiKey": 1 },
      { name: "autoflow_apiKey_idx", sparse: true }
    );

    // Align counters.shopId to current max numeric shopId
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

    // ---- setup_tokens (invite/setup)
    await dropConflictingIndex(setupTokens, { token: 1 }, "setup_token_unique");
    await ensureIndex(setupTokens, { token: 1 }, { unique: true, name: "setup_token_unique" });

    await dropConflictingIndex(setupTokens, { expiresAt: 1 }, "setup_token_ttl");
    await ensureIndex(
      setupTokens,
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "setup_token_ttl" }
    );

    // ---- users (one email per shop)
    await dropConflictingIndex(users, { shopId: 1, emailLower: 1 }, "user_unique_per_shop");
    await ensureIndex(
      users,
      { shopId: 1, emailLower: 1 },
      { unique: true, name: "user_unique_per_shop" }
    );

    // ---- sessions (unique token + TTL)
    await dropConflictingIndex(sessions, { token: 1 }, "session_token_unique");
    await ensureIndex(sessions, { token: 1 }, { unique: true, name: "session_token_unique" });

    await dropConflictingIndex(sessions, { expiresAt: 1 }, "session_ttl");
    await ensureIndex(
      sessions,
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "session_ttl" }
    );

    // ---- password_resets (unique token + TTL)
    await dropConflictingIndex(pwresets, { token: 1 }, "pwreset_token_unique");
    await ensureIndex(pwresets, { token: 1 }, { unique: true, name: "pwreset_token_unique" });

    await dropConflictingIndex(pwresets, { expiresAt: 1 }, "pwreset_ttl");
    await ensureIndex(
      pwresets,
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "pwreset_ttl" }
    );

    // ---- ratelimits (unique bucket + TTL)
    await dropConflictingIndex(ratelimits, { bucketKey: 1 }, "ratelimit_bucket_unique");
    await ensureIndex(
      ratelimits,
      { bucketKey: 1 },
      { unique: true, name: "ratelimit_bucket_unique" }
    );

    await dropConflictingIndex(ratelimits, { expiresAt: 1 }, "ratelimit_ttl");
    await ensureIndex(
      ratelimits,
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "ratelimit_ttl" }
    );

    // ---- events (for webhook console)
    await dropConflictingIndex(events, { shopId: 1, receivedAt: -1 }, "events_shop_receivedAt");
    await ensureIndex(
      events,
      { shopId: 1, receivedAt: -1 },
      { name: "events_shop_receivedAt" }
    );

    await dropConflictingIndex(events, { receivedAt: -1 }, "events_receivedAt");
    await ensureIndex(
      events,
      { receivedAt: -1 },
      { name: "events_receivedAt" }
    );

    const counterNow = await counters.findOne({ _id: "shopId" });
    return NextResponse.json({
      ok: true,
      force,
      indexes: [
        "shops.shopId (unique)",
        "shops.credentials.autoflow.apiKey (sparse)",
        "setup_tokens.token (unique)",
        "setup_tokens.expiresAt (TTL)",
        "users {shopId,emailLower} (unique)",
        "sessions.token (unique)",
        "sessions.expiresAt (TTL)",
        "password_resets.token (unique)",
        "password_resets.expiresAt (TTL)",
        "ratelimits.bucketKey (unique)",
        "ratelimits.expiresAt (TTL)",
        "events {shopId,receivedAt:-1}",
        "events {receivedAt:-1}",
      ],
      counter: counterNow,
      maxExisting,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
