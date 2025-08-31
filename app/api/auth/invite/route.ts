import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (!owner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const role = (body.role as string) || "staff";
  const days = Math.max(1, Math.min(30, Number(body.days || 7)));

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const db = await getDb();
  const setupTokens = db.collection("setup_tokens");

  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  await setupTokens.insertOne({
    token,
    shopId: owner.shopId,
    emailLower: email,
    role,
    createdAt: now,
    expiresAt,
  });

  const base = process.env.PUBLIC_BASE_URL || req.nextUrl.origin;
  const inviteUrl = `${base}/setup?shopId=${owner.shopId}&token=${token}`;

  return NextResponse.json({ ok: true, inviteUrl, expiresAt, role, email });
}
