// /app/api/webhooks/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/mongo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || "mos-maintenance-mvp";

async function getDb() {
  const client = await getMongo();
  return client.db(DB_NAME);
}

export async function GET(req: NextRequest) {
  const db = await getDb();
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId") || undefined;
  const source = url.searchParams.get("source") || undefined;
  const eventType = url.searchParams.get("type") || undefined;
  const full = ["1", "true", "yes", "on"].includes((url.searchParams.get("full") || "").toLowerCase());
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  // since can be ms timestamp or ISO string
  let since: number | undefined;
  const sinceParam = url.searchParams.get("since");
  if (sinceParam) {
    const n = Number(sinceParam);
    if (Number.isFinite(n)) {
      since = n;
    } else {
      const dt = Date.parse(sinceParam);
      if (!Number.isNaN(dt)) since = dt;
    }
  }

  const q: any = {};
  if (shopId) q.shopId = shopId;
  if (source) q.source = source;
  if (eventType) q.eventType = eventType;
  if (since) q.receivedAt = { $gte: since };

  const projection = full
    ? { _id: 0 }
    : { _id: 0, shopId: 1, source: 1, eventType: 1, receivedAt: 1, status: 1, "payload.id": 1 };

  const events = await db
    .collection("webhook_events")
    .find(q, { projection })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json({
    count: events.length,
    filter: { shopId, source, eventType, since, limit, full },
    events,
  });
}
