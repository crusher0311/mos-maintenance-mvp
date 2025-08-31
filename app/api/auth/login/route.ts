import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await safeJson(req);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const shopId = body?.shopId; // optional

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const db = await getDb();
    const users = db.collection("users");
    const sessions = db.collection("sessions");

    // Find user (optionally filter by shopId)
    let user: any = null;
    if (Number.isFinite(shopId)) {
      user = await users.findOne({ emailLower: email, shopId: Number(shopId) });
    } else {
      // If multiple accounts share the same email across shops, ask for shopId
      const cursor = users.find({ emailLower: email }).limit(2);
      const all = await cursor.toArray();
      if (all.length === 0) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
      if (all.length > 1) {
        return NextResponse.json(
          { error: "Multiple accounts found for this email. Please provide your Shop ID." },
          { status: 409 }
        );
      }
      user = all[0];
    }

    // Verify password (scrypt:1:<salt>:<hash>)
    if (!user?.passwordHash || !user?.passwordHash.startsWith("scrypt:1:")) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    const ok = await verifyScrypt(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Create session
    const now = new Date();
    const token = crypto.randomBytes(24).toString("hex");
    const ttlDays = 30;
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    await sessions.insertOne({
      token,
      userId: user._id,
      shopId: user.shopId,
      createdAt: now,
      expiresAt,
    });

    const res = NextResponse.json({
      ok: true,
      redirect: "/dashboard",
      shopId: user.shopId,
      role: user.role,
    });
    res.cookies.set("sid", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

async function safeJson(req: NextRequest) {
  try { return await req.json(); } catch { return null; }
}

async function verifyScrypt(password: string, stored: string): Promise<boolean> {
  // format: "scrypt:1:<salt>:<hash>"
  const [, , salt, hexHash] = stored.split(":");
  if (!salt || !hexHash) return false;

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, buf) => (err ? reject(err) : resolve(buf)));
  });
  const a = Buffer.from(hexHash, "hex");
  const b = derived;
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
