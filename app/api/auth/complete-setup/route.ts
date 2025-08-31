import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/complete-setup
 * Body: { shopId: number, token: string, email: string, password: string }
 *
 * Validates setup token, creates first user for the shop, creates a session, sets HttpOnly cookie.
 */
export async function POST(req: NextRequest) {
  try {
    const { shopId, token, email, password } = (await safeJson(req)) as any;

    if (!Number.isFinite(shopId)) {
      return NextResponse.json({ error: "Invalid shopId" }, { status: 400 });
    }
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing or invalid token" }, { status: 400 });
    }
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const db = await getDb();
    const shops = db.collection("shops");
    const setupTokens = db.collection("setup_tokens");
    const users = db.collection("users");
    const sessions = db.collection("sessions");

    // Validate shop
    const shop = await shops.findOne({ shopId }, { projection: { _id: 1, name: 1 } });
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    // Validate setup token
    const now = new Date();
    const tok = await setupTokens.findOne({ token, shopId });
    if (!tok) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (tok.usedAt) {
      return NextResponse.json({ error: "Token already used" }, { status: 400 });
    }
    if (tok.expiresAt && now > new Date(tok.expiresAt)) {
      return NextResponse.json({ error: "Token expired" }, { status: 400 });
    }

    // Ensure user uniqueness (email per shop)
    const emailLower = String(email).trim().toLowerCase();
    await ensureUserIndexes(users, sessions);

    const existing = await users.findOne({ shopId, emailLower }, { projection: { _id: 1 } });
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists for the shop" }, { status: 409 });
    }

    // Hash password with Node's scrypt
    const { hash, salt } = await scryptHash(password);
    const passwordHash = `scrypt:1:${salt}:${hash}`;

    // Determine role: first user becomes "owner"
    const countForShop = await users.countDocuments({ shopId });
    const role = countForShop === 0 ? "owner" : "admin";

    const createdAt = now;
    const userIns = await users.insertOne({
      shopId,
      email,
      emailLower,
      role,
      passwordHash,
      createdAt,
      updatedAt: createdAt,
    });

    // Mark token used
    await setupTokens.updateOne({ token }, { $set: { usedAt: now } });

    // Create a server-side session and set cookie
    const sessionToken = crypto.randomBytes(24).toString("hex");
    const ttlDays = 30;
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    await sessions.insertOne({
      token: sessionToken,
      userId: userIns.insertedId,
      shopId,
      createdAt: now,
      expiresAt,
    });

    const res = NextResponse.json({
      ok: true,
      shopId,
      userId: String(userIns.insertedId),
      role,
      // Later you can redirect to a dashboard route:
      // redirect: `/shops/${shopId}/dashboard`
    });

    // HttpOnly cookie
    res.cookies.set("sid", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}

async function safeJson(req: NextRequest) {
  try { return await req.json(); } catch { return null; }
}

function scryptHash(password: string): Promise<{ hash: string; salt: string }> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, result) => {
      if (err) return reject(err);
      resolve({ hash: Buffer.from(result).toString("hex"), salt });
    });
  });
}

async function ensureUserIndexes(users: any, sessions: any) {
  // unique email per shop (case-insensitive via emailLower)
  await users.createIndex({ shopId: 1, emailLower: 1 }, { unique: true, name: "users_shop_email_unique" });
  // sessions: unique token and TTL on expiresAt
  await sessions.createIndex({ token: 1 }, { unique: true, name: "sessions_token_unique" });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "sessions_expires_ttl" });
}
