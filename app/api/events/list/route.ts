import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { requireOwner } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/list?limit=50
 * Owner-only. Lists recent webhook events for the owner's shop.
 */
export async function GET(req: NextRequest) {
  const owner = await requireOwner(req);
  if (!owner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));

  const db = await getDb();
  const ev = db.collection("events");

  const rows = await ev
    .find({ shopId: owner.shopId })
    .project({
      provider: 1,
      receivedAt: 1,
      payload: 1,
    })
    .sort({ receivedAt: -1, _id: -1 })
    .limit(limit)
    .toArray();

  const data = rows.map((r: any) => {
    const eventName =
      (r?.payload && (r.payload.event || r.payload.type || r.payload.action)) || "(unknown)";
    let preview = "";
    try {
      preview = JSON.stringify(r.payload);
      if (preview.length > 300) preview = preview.slice(0, 300) + "…";
    } catch {
      preview = "";
    }
    return {
      id: String(r._id),
      ts: r.receivedAt,
      provider: r.provider || "autoflow",
      event: eventName,
      preview,
      payload: r.payload ?? null,
    };
  });

  return NextResponse.json({ ok: true, shopId: owner.shopId, events: data });
}
