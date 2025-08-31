import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const sid = req.cookies.get("sid")?.value;
    const db = await getDb();
    const sessions = db.collection("sessions");

    if (sid) {
      await sessions.deleteOne({ token: sid });
    }

    const res = NextResponse.json({ ok: true });
    // Expire cookie
    res.cookies.set("sid", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
