import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("sid")?.value;
    if (!cookie) return NextResponse.json({ ok: false, error: "No session" }, { status: 401 });

    const db = await getDb();
    const sessions = db.collection("sessions");
    const users = db.collection("users");

    const now = new Date();
    const sess = await sessions.findOne({ token: cookie, expiresAt: { $gt: now } });
    if (!sess) return NextResponse.json({ ok: false, error: "Invalid/expired session" }, { status: 401 });

    const user = await users.findOne(
      { _id: sess.userId },
      { projection: { _id: 0, email: 1, role: 1, shopId: 1 } }
    );
    if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });

    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
