// app/api/events/autoflow/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  // Only signed-in users can view logs
  const sess = await requireSession();

  const { searchParams } = new URL(req.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(100, limitParam))
    : 25;

  const db = await getDb();
  const logs = await db
    .collection("events")
    .find({ provider: "autoflow", shopId: sess.shopId })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .project({
      _id: 0,
      receivedAt: 1,
      token: 1,
      payload: 1,
      raw: 1,
    })
    .toArray();

  return NextResponse.json(
    { ok: true, logs },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
