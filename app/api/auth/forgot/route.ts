import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/forgot
 * Body: { email: string, shopId?: number }
 *
 * If a single account matches, creates a short-lived reset token and returns a reset URL.
 * Always returns 200 to avoid email enumeration (resetUrl included for dev).
 */
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const users = db.collection("users");
    const pwresets = db.collection("password_resets");

    const body = await req.json().catch(() => ({}));
    const emailLower = String(body?.email || "").trim().toLowerCase();
    const shopId = Number.isFinite(body?.shopId) ? Number(body.shopId) : undefined;

    if (!emailLower) {
      return NextResponse.json({ ok: true, note: "If the account exists, a reset link will be generated." });
    }

    let user: any = null;

    if (typeof shopId === "number") {
      user = await users.findOne({ emailLower, shopId });
    } else {
      // If the same email is used in multiple shops, require shopId
      const matches = await users.find({ emailLower }).limit(2).toArray();
      if (matches.length > 1) {
        return NextResponse.json(
          { ok: false, error: "Multiple accounts for this email. Please include shopId." },
          { status: 409 }
        );
      }
      user = matches[0] || null;
    }

    // Always respond 200; include resetUrl only when token created
    if (!user) {
      return NextResponse.json({
        ok: true,
        note: "If the account exists, a reset link will be generated.",
      });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const now = new Date();
    const minutes = 30; // token lifetime
    const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);

    await pwresets.insertOne({
      token,
      userId: user._id,
      shopId: user.shopId,
      emailLower,
      createdAt: now,
      expiresAt,
    });

    const base = process.env.PUBLIC_BASE_URL || req.nextUrl.origin;
    const resetUrl = `${base}/reset?token=${token}`;

    return NextResponse.json({
      ok: true,
      resetUrl,        // (dev) you can copy this; later send via email provider
      expiresAt,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
