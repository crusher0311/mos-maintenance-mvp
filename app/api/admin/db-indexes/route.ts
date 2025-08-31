import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// shallow equality for index key specs (stable enough for simple 1/-1 keys)
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

    // helper: when `force=1`, drop any existing index on the same key pattern
    // but with a different name (prevents "index already exists with a different name")
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
      } catch {
        // ignore if listIndexes fails (collection may be new)
      }
    }

    // helper: create index and tolerate "already exists" or "options conflict"
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

    // ---- password_resets (this is the new part you asked for)
    await dropConflictingIndex(pwresets, { token: 1 }, "pwreset_token_unique");
    await ensureIndex(pwresets, { token: 1 }, { unique: true, name: "pwreset_token_unique" });

    await dropConflictingIndex(pwresets, { expiresAt: 1 }, "pwreset_ttl");
    await ensureIndex(
      pwresets,
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "pwreset_ttl" }
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
      ],
      counter: counterNow,
      maxExisting,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
