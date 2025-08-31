import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sid = req.cookies.get("sid")?.value;

  // Optional: remove server-side session
  if (sid) {
    try {
      const db = await getDb();
      await db.collection("sessions").deleteOne({ token: sid });
    } catch {
      /* ignore */
    }
  }

  // Clear cookie and redirect to login
  const res = NextResponse.json({ ok: true, redirect: "/login" });
  res.cookies.set("sid", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return res;
}
