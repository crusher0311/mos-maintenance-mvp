import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";
import { sendEmail, makeResetEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const users = db.collection("users");
    const pwresets = db.collection("password_resets");

    const body = await req.json().catch(() => ({}));
    const emailLower = String(body?.email || "").trim().toLowerCase();
    const shopId = Number.isFinite(body?.shopId) ? Number(body.shopId) : undefined;

    // ---- Rate limit (5 requests / hour per IP + email + shop) ----
    const ip = clientIp(req);
    const rl = await rateLimit({
      id: `forgot:${ip}:${emailLower}:${shopId ?? "_"}`,
      limit: 5,
      windowSeconds: 60 * 60,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

    if (!emailLower) {
      return NextResponse.json({ ok: true, note: "If the account exists, a reset link will be generated." });
    }

    let user: any = null;
    if (typeof shopId === "number") {
      user = await users.findOne({ emailLower, shopId });
    } else {
      const matches = await users.find({ emailLower }).limit(2).toArray();
      if (matches.length > 1) {
        return NextResponse.json(
          { ok: false, error: "Multiple accounts for this email. Please include shopId." },
          { status: 409 }
        );
      }
      user = matches[0] || null;
    }

    if (!user) {
      return NextResponse.json({
        ok: true,
        note: "If the account exists, a reset link will be generated.",
      });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const now = new Date();
    const minutes = 30;
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

    try {
      const { subject, html, text } = makeResetEmail(resetUrl);
      await sendEmail({ to: user.email as string, subject, html, text });
    } catch (e) {
      console.warn("sendEmail failed:", e);
    }

    return NextResponse.json({ ok: true, resetUrl, expiresAt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

