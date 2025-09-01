// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongo";
import { sessionCookieOptions } from "@/lib/auth";

function looksLikeBcrypt(s: unknown) {
  return typeof s === "string" && /^\$2[aby]\$/.test(s);
}

export async function POST(req: Request) {
  try {
    const { email, password, shopId } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const db = await getDb();

    // Find by email (+ optional shop)
    const query: any = { email: String(email).toLowerCase() };
    if (shopId !== undefined && shopId !== null && String(shopId).trim() !== "") {
      query.shopId = Number(shopId);
    }

    // Handle duplicate emails across shops more clearly
    const candidates = await db
      .collection("users")
      .find(query.shopId ? query : { email: query.email })
      .project({ _id: 1, email: 1, role: 1, passwordHash: 1, password: 1, shopId: 1 })
      .toArray();

    if (candidates.length === 0) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (!query.shopId && candidates.length > 1) {
      return NextResponse.json(
        { error: "Multiple shops found for this email. Please enter your Shop ID." },
        { status: 400 }
      );
    }

    const user = query.shopId
      ? candidates[0]
      : candidates[0]; // unique by email or we already error’d above

    // Password checks with graceful migration
    const dbHash = user.passwordHash;
    const legacyPlain = user.password; // legacy field (plaintext or other)

    let passOk = false;

    if (looksLikeBcrypt(dbHash)) {
      passOk = await bcrypt.compare(String(password), String(dbHash));
    } else if (legacyPlain) {
      // Compare plaintext legacy; if ok, upgrade to bcrypt
      passOk = String(password) === String(legacyPlain);
      if (passOk) {
        const newHash = await bcrypt.hash(String(password), 10);
        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { passwordHash: newHash }, $unset: { password: "" } }
        );
      }
    }

    if (!passOk) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Create session
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

    await db.collection("sessions").insertOne({
      token,
      userId: user._id,
      shopId: Number(user.shopId ?? shopId ?? 0),
      createdAt: new Date(),
      expiresAt,
    });

    cookies().set("session_token", token, sessionCookieOptions(60 * 60 * 24 * 30));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
