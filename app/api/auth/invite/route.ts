import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const sessions = db.collection("sessions");
    const users = db.collection("users");
    const setup = db.collection("setup_tokens");

    // must be signed in
    const sid = req.cookies.get("sid")?.value;
    if (!sid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const now = new Date();
    const sess = await sessions.findOne({ token: sid, expiresAt: { $gt: now } });
    if (!sess) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const me = await users.findOne({ _id: sess.userId });
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 401 });
    if (me.role !== "owner") {
      return NextResponse.json({ error: "Only owners can invite users" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const emailLower = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "staff");
    if (!emailLower) return NextResponse.json({ error: "Email required" }, { status: 400 });

    // create invite token (7 days)
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await setup.insertOne({
      token,
      shopId: me.shopId,
      emailLower,
      role,
      createdBy: me._id,
      createdAt: new Date(),
      expiresAt,
    });

    const base = process.env.PUBLIC_BASE_URL || "https://mos-maintenance-mvp.vercel.app";
    const inviteUrl = `${base}/setup?shopId=${me.shopId}&token=${token}&email=${encodeURIComponent(emailLower)}`;

    return NextResponse.json({ ok: true, inviteUrl, expiresAt });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
