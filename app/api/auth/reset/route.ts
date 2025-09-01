import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";
import { clientIp, rateLimit } from "@/lib/rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseScrypt(hash: string) {
  const [algo, v, salt, hex] = String(hash || "").split(":");
  if (algo !== "scrypt") return null;
  return { version: Number(v || 1), salt, hex };
}

async function hashPasswordScrypt(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, buf) => (err ? reject(err) : resolve(buf)))
  );
  return `scrypt:1:${salt}:${derived.toString("hex")}`;
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const pwresets = db.collection("password_resets");
    const users = db.collection("users");
    const sessions = db.collection("sessions");

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "");
    const password = String(body?.password || "");

    // ---- Rate limit (5 resets / hour per IP + token) ----
    const ip = clientIp(req);
    const rl = await rateLimit({
      id: `reset:${ip}:${token.slice(0, 16)}`,
      limit: 5,
      windowSeconds: 60 * 60,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

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

    const passwordHash = await hashPasswordScrypt(password);

    await users.updateOne(
      { _id: pr.userId },
      { $set: { passwordHash, updatedAt: now } }
    );

    await sessions.deleteMany({ userId: pr.userId });
    await pwresets.deleteOne({ _id: pr._id });

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
