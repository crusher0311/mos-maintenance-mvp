import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset
 * Body: { token: string, password: string }
 *
 * Verifies token, updates user's password, clears existing sessions, starts a fresh session.
 */
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const pwresets = db.collection("password_resets");
    const users = db.collection("users");
    const sessions = db.collection("sessions");

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "");
    const password = String(body?.password || "");

    if (!token || !password) {
      return NextResponse.json({ error: "Missing token or password" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const now = new Date();
    const pr = await pwresets.findOne({ token, expiresAt: { $gt: now } });
    if (!pr) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // Hash new password (scrypt:1:<salt>:<hash>)
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, buf) => (err ? reject(err) : resolve(buf)));
    });
    const passwordHash = `scrypt:1:${salt}:${derived.toString("hex")}`;

    // Update user
    await users.updateOne(
      { _id: pr.userId },
      { $set: { passwordHash, updatedAt: now } }
    );

    // Invalidate old sessions
    await sessions.deleteMany({ userId: pr.userId });

    // Remove token (single-use)
    await pwresets.deleteOne({ _id: pr._id });

    // Create fresh session
    const sid = crypto.randomBytes(24).toString("hex");
    const ttlDays = 30;
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    await sessions.insertOne({
      token: sid,
      userId: pr.userId,
      shopId: pr.shopId,
      createdAt: now,
      expiresAt,
    });

    const res = NextResponse.json({ ok: true, redirect: "/dashboard" });
    res.cookies.set("sid", sid, {
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
