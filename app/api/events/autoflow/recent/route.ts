// app/api/events/autoflow/recent/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Protect this so only signed-in users can view logs
  const sess = await requireSession();

  const db = await getDb();
  const logs = await db
    .collection("events")
    .find({ provider: "autoflow", shopId: sess.shopId })
    .sort({ receivedAt: -1 })
    .limit(25)
    .project({
      _id: 0,
      receivedAt: 1,
      token: 1,
      payload: 1,
      raw: 1,
    })
    .toArray();

  return NextResponse.json({ ok: true, logs });
}
