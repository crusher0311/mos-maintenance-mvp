// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongo";
import { sessionCookieOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password, shopId } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const db = await getDb();

    // 1) Find user (optionally by shop)
    const user = await db.collection("users").findOne(
      { email: String(email).toLowerCase(), ...(shopId ? { shopId: Number(shopId) } : {}) },
      { projection: { _id: 1, email: 1, role: 1, passwordHash: 1, shopId: 1 } }
    );
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // 2) Check password
    const ok = await bcrypt.compare(String(password), String(user.passwordHash));
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // 3) Create session in DB
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

    await db.collection("sessions").insertOne({
      token,
      userId: user._id,
      shopId: Number(user.shopId ?? shopId ?? 0),
      createdAt: new Date(),
      expiresAt,
    });

    // 4) Set cookie
    const cookieOpts = sessionCookieOptions(60 * 60 * 24 * 30);
    cookies().set("session_token", token, cookieOpts);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
