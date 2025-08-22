// src/app/api/webhooks/autoflow/route.js
import { setDvi, getDvi, getCarfaxPoints, setCarfaxPoints } from "@/lib/state";

/**
 * Minimal Autoflow webhook receiver (MVP)
 * - Accepts POST JSON from Autoflow.
 * - Extracts VIN, mileage, and DVI findings (red/yellow).
 * - Appends an odometer point (date + mileage) for miles/day projections.
 */

function toNumber(x) {
  const n = Number(String(x ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeFinding(item) {
  // Autoflow: item_status "0|1|2" (0=red, 1=yellow, 2=green)
  const raw = String(item?.item_status ?? "").trim();
  let status = "";
  if (raw === "0") status = "red";
  else if (raw === "1") status = "yellow";
  else if (raw === "2") status = "green";
  else return null; // ignore unknown

  const label = item?.item_name || "Item";
  const notes = item?.item_notes || "";

  return {
    key: (item?.item_id ? String(item.item_id) : label).toLowerCase().replace(/\s+/g, "_"),
    label,
    status,
    notes,
  };
}

function extractFindingsFromDviCategories(dviCategories = []) {
  const out = [];
  for (const cat of dviCategories) {
    for (const it of (cat?.dvi_items || [])) {
      const f = normalizeFinding(it);
      if (f && (f.status === "red" || f.status === "yellow")) out.push(f);
    }
  }
  return out;
}

export async function POST(req) {
  try {
    const body = await req.json();

    // Autoflow sometimes nests under "content"
    const root = body?.content || body || {};
    const vin =
      root.vin ||
      root.vehicle_vin ||
      root.vehicle?.vin ||
      "";
    const mileage = toNumber(root.mileage || root.vehicle_mileage || root.vehicle?.mileage || 0);

    // Try to read DVI categories
    let findings = [];
    if (Array.isArray(root.dvis) && root.dvis.length > 0) {
      const first = root.dvis[0];
      findings = extractFindingsFromDviCategories(first?.dvi_category || []);
    }

    // Update DVI state if we have core fields
    if (vin && mileage > 0) {
      const clean = findings.map(f => ({
        key: f.key || "",
        label: f.label || "",
        status: f.status || "",
        notes: f.notes || "",
      }));

      setDvi({ vin, mileage, findings: clean });

      // Choose a date for the odometer point
      let dateStr = "";
      if (Array.isArray(root.dvis) && root.dvis[0]?.completed_datetime) {
        dateStr = String(root.dvis[0].completed_datetime).split("T")[0];
      } else if (root?.completed_datetime) {
        dateStr = String(root.completed_datetime).split("T")[0];
      } else {
        dateStr = new Date().toISOString().slice(0, 10); // today
      }

      // Append + normalize odometer history
      const prev = getCarfaxPoints();
      const combined = [...prev, { date: dateStr, odo: mileage }]
        .sort((a, b) => new Date(a.date) - new Date(b.date) || a.odo - b.odo)
        .filter((p, i, arr) => i === 0 || (p.date !== arr[i - 1].date || p.odo !== arr[i - 1].odo))
        .slice(-24);

      setCarfaxPoints(combined);
    }

    return Response.json({
      ok: true,
      vin,
      mileage,
      findingsCount: findings.length,
      pointsCount: getCarfaxPoints().length,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
