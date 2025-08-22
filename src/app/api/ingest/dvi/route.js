// src/app/api/ingest/dvi/route.js
import { setDvi } from "@/lib/state";

/**
 * Accepts a payload shaped like:
 * {
 *   vin: "1FT8W3BT0BEA08647",
 *   mileage: 94615,
 *   findings: [
 *     { key: "oil_leak", label: "Lower Fluid Leaks", status: "red", notes: "..." },
 *     { key: "air_filter", label: "Air Filter", status: "yellow", notes: "..." },
 *     ...
 *   ]
 * }
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { vin, mileage, findings } = body || {};

    if (!vin) return Response.json({ error: "vin required" }, { status: 400 });
    if (typeof mileage !== "number")
      return Response.json({ error: "mileage (number) required" }, { status: 400 });
    if (!Array.isArray(findings))
      return Response.json({ error: "findings[] array required" }, { status: 400 });

    // Basic normalize of statuses
    const clean = (findings || []).map(f => ({
      key: f.key || "",
      label: f.label || "",
      status: (f.status || "").toLowerCase(), // expect "red" | "yellow" | "green"
      notes: f.notes || "",
    }));

    setDvi({ vin, mileage, findings: clean });
    return Response.json({ ok: true, vin, findingsCount: clean.length });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
