// src/app/api/ingest/carfax/route.js
import { setCarfaxPoints } from "@/lib/state";

export async function POST(req) {
  try {
    const body = await req.json();
    const points = body?.points;

    if (!Array.isArray(points) || points.length === 0) {
      return Response.json({ error: "Body must include non-empty points[]" }, { status: 400 });
    }

    // Basic validation
    for (const p of points) {
      if (!p?.date || typeof p?.odo !== "number") {
        return Response.json({ error: "Each point needs { date: 'YYYY-MM-DD', odo: Number }" }, { status: 400 });
      }
    }

    setCarfaxPoints(points);
    return Response.json({ ok: true, count: points.length });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
