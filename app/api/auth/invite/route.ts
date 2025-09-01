import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { getSession } from "@/lib/auth";
import crypto from "node:crypto";
import { sendEmail, makeInviteEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sess = await getSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { user } = sess;
  if (user.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await safeJson(req);
  const emailInput = String(body?.email || "").trim().toLowerCase();
  const inviteRole = (String(body?.role || "staff").trim().toLowerCase()) as
    | "owner"
    | "manager"
    | "staff"
    | "viewer";

  if (!emailInput) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const db = await getDb();
  const setup = db.collection("setup_tokens");

  const token = crypto.randomBytes(16).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await setup.insertOne({
    token,
    shopId: user.shopId,
    emailLower: emailInput,
    role: inviteRole,
    createdBy: user._id,
    createdAt: now,
    expiresAt,
  });

  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    `https://${req.headers.get("host") || "localhost:3000"}`;
  const setupUrl = `${base}/setup?shopId=${user.shopId}&token=${token}`;

  // Optional email (no-op if you don’t have SMTP configured)
  try {
    const msg = makeInviteEmail({
      to: emailInput,
      shopId: user.shopId,
      setupUrl,
      invitedBy: user.email,
    });
    await sendEmail(msg);
  } catch {
    // Swallow email errors to avoid blocking invites in dev
  }

  return NextResponse.json({ ok: true, setupUrl });
}

async function safeJson(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
