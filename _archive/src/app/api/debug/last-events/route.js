// src/app/api/debug/last-events/route.js
import { dbConnect } from "@/lib/db";
import { WebhookLog } from "@/lib/models";

export async function GET(req) {
  await dbConnect();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 5), 50);

  const logs = await WebhookLog
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // Don’t return giant header bags unless needed
  const trimmed = logs.map(l => ({
    _id: l._id,
    source: l.source,
    receivedAt: l.receivedAt || l.createdAt,
    ok: l.ok,
    error: l.error || "",
    url: l.url,
    vin: l.body?.content?.vin || l.body?.vin || null,
    mileage: l.body?.content?.mileage || l.body?.mileage || null,
    eventPreview: Object.keys(l.body || {}).slice(0, 5), // tiny peek at top-level fields
  }));

  return Response.json({ count: trimmed.length, logs: trimmed });
}
