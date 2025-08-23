// src/app/api/timeline/[vin]/route.js
import { dbConnect } from "@/lib/db";
import { ServiceEvent } from "@/lib/models";

export async function GET(req, context) {
  const { vin } = await context.params;
  await dbConnect();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  const rows = await ServiceEvent
    .find({ vin })
    .sort({ date: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  const out = rows.map(r => ({
    type: r.type,
    date: r.date,
    mileage: r.mileage ?? null,
    visitId: r.visitId ?? null,
    source: r.source || "autoflow",
    // small, safe preview of payload
    payload: {
      event: r.payload?.event || null,
      summary: r.payload?.summary || null,
    },
  }));

  return Response.json({ vin, count: out.length, events: out });
}

