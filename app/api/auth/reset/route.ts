// app/api/auth/reset/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongo";

/**
 * Expects JSON: { email, shopId?, token, newPassword }
 * You should validate "token" according to your reset flow.
 * This version only demonstrates hashing & update.
 */
export async function POST(req: Request) {
  try {
    const { email, shopId, token, newPassword } = await req.json();

    if (!email || !newPassword) {
      return NextResponse.json({ error: "Email and new password are required" }, { status: 400 });
    }

    // TODO: verify "token" against your reset token collection/table
    // if (!isValidToken(token, email)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

    const db = await getDb();

    const query: any = { email: String(email).toLowerCase() };
    if (shopId !== undefined && shopId !== null && String(shopId).trim() !== "") {
      query.shopId = Number(shopId);
    }

    const user = await db.collection("users").findOne(query, { projection: { _id: 1 } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const hash = await bcrypt.hash(String(newPassword), 10);

    await db
      .collection("users")
      .updateOne({ _id: user._id }, { $set: { passwordHash: hash }, $unset: { password: "" } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Password reset error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

