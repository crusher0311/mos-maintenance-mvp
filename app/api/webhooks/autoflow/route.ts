import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Optional: when there are no items in the webhook, auto-run analyzer
const ANALYZE_ON_STATUS = process.env.ANALYZE_ON_STATUS === "1";

// ---------- small helpers ----------
const toStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
const digits = (v: any) => toStr(v).replace(/[^0-9]/g, "");

// Try many places for VIN / ODO / RO (Autoflow events vary)
function pickVin(body: any): string | null {
  const cands = [
    body?.vehicle?.vin, body?.data?.vehicle?.vin, body?.data?.vin,
    body?.vin, body?.VIN, body?.vehicleVIN, body?.vinNumber
  ];
  for (const c of cands) {
    const v = toStr(c).trim().toUpperCase();
    if (v && v.length === 17) return v;
  }
  return null;
}

function pickOdometer(body: any): number | null {
  const cands = [
    body?.vehicle?.odometer, body?.data?.vehicle?.odometer, body?.data?.odometer,
    body?.mileage, body?.odometer, body?.odometerIn, body?.odometerOut,
    body?.vehicle?.mileage
  ];
  for (const c of cands) {
    const n = Number(digits(c));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function pickRO(body: any): string | null {
  const cands = [
    body?.ro, body?.roNumber, body?.ro_no, body?.repairOrderNumber,
    body?.data?.roNumber, body?.ticketNumber, body?.workOrderNumber,
    body?.invoiceNumber, body?.repairOrder?.number, body?.workorder?.number
  ];
  for (const c of cands) {
    const s = toStr(c).trim();
    if (s) return s;
  }
  return null;
}

// Map vendor-ish statuses to our 4 buckets
function mapStatus(v: string) {
  const s = toStr(v).toLowerCase().trim();
  switch (s) {
    case "overdue":
    case "past_due":
      return "overdue";
    case "recommended":
    case "open":
    case "approved":
    case "needs_service":
      return "due";
    case "declined":
    case "deferred":
      return "not_yet";
    case "completed":
    case "done":
    case "closed":
      return "not_yet";
    default:
      return "coming_soon";
  }
}

const pickName = (o: any) =>
  toStr(o?.name) ||
  toStr(o?.title) ||
  toStr(o?.operation) ||
  toStr(o?.service) ||
  toStr(o?.description) ||
  "Unnamed";

const pickNotes = (o: any) => {
  const note = o?.notes ?? o?.comment ?? o?.reason ?? o?.recommendation ?? null;
  return note == null ? null : toStr(note);
};

// Normalize recommendations from various common fields
function extractRecsFromBody(body: any) {
  const keys = ["recommendations", "services", "serviceItems", "lineItems", "operations", "items"];
  const recs: Array<{ name: string; status: string; notes: string | null }> = [];

  for (const key of keys) {
    const arr =
      (Array.isArray(body?.[key]) && body[key]) ||
      (Array.isArray(body?.data?.[key]) && body.data[key]) ||
      null;
    if (!arr) continue;
    for (const it of arr as any[]) {
      const name = pickName(it);
      const status = mapStatus(it?.status ?? it?.state ?? body?.status ?? "");
      const notes = pickNotes(it);
      recs.push({ name, status, notes });
    }
  }

  // Single-item fallback
  if (!recs.length) {
    const singleName = pickName(body) || pickName(body?.data || {}) || null;
    if (singleName) {
      const status = mapStatus(body?.status ?? body?.data?.status ?? "");
      const notes = pickNotes(body?.data || body) || null;
      recs.push({ name: singleName, status, notes });
    }
  }

  // Dedup naive
  const seen = new Set<string>();
  const out: typeof recs = [];
  for (const r of recs) {
    const key = `${r.name}::${r.status}::${r.notes ?? ""}`;
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out;
}

// ---------- route ----------
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    let body: any;
    try {
      body = JSON.parse(raw || "{}");
    } catch (e: any) {
      return NextResponse.json({ error: "Invalid JSON", detail: e?.message, raw }, { status: 400 });
    }

    // Pull VIN / ODO / RO from anywhere reasonable
    const vin = pickVin(body);
    if (!vin) return NextResponse.json({ error: "VIN missing/invalid" }, { status: 400 });
    const odo = pickOdometer(body);
    const ro  = pickRO(body);

    // Upsert vehicle (odometer if present)
    await prisma.vehicle.upsert({
      where: { vin },
      create: {
        vin,
        year: Number.isFinite(body?.vehicle?.year) ? body.vehicle.year :
              Number.isFinite(body?.data?.vehicle?.year) ? body.data.vehicle.year : null,
        make: toStr(body?.vehicle?.make || body?.data?.vehicle?.make) || null,
        model: toStr(body?.vehicle?.model || body?.data?.vehicle?.model) || null,
        trim: toStr(body?.vehicle?.trim || body?.data?.vehicle?.trim) || null,
        odometer: odo ?? null,
      },
      update: {
        year: Number.isFinite(body?.vehicle?.year) ? body.vehicle.year : undefined,
        make: toStr(body?.vehicle?.make || body?.data?.vehicle?.make) || undefined,
        model: toStr(body?.vehicle?.model || body?.data?.vehicle?.model) || undefined,
        trim: toStr(body?.vehicle?.trim || body?.data?.vehicle?.trim) || undefined,
        odometer: odo ?? undefined,
      },
    });

    // Store the raw event + extracted fields for easy viewing
    await prisma.vehicleEvent.create({
      data: {
        vehicleVin: vin,
        // ✅ ensure this is a string label, not "[object Object]"
        type: toStr(body?.type ?? body?.event?.type ?? body?.event ?? "status_change"),
        source: toStr(body?.source || "autoflow"),
        payload: { ...body, _extracted: { vin, odometer: odo, ro } },
      },
    });

    // Normalize any item arrays into ServiceRecommendation rows
    const recs = extractRecsFromBody(body);
    if (recs.length) {
      await prisma.$transaction(async (tx) => {
        await tx.serviceRecommendation.deleteMany({
          where: { vehicleVin: vin, source: "autoflow" },
        });
        await tx.serviceRecommendation.createMany({
          data: recs.map((r) => ({
            vehicleVin: vin,
            name: r.name,
            status: r.status,
            notes: r.notes,
            source: "autoflow",
          })),
        });
      });
    } else if (ANALYZE_ON_STATUS) {
      // Fire-and-forget analyzer run so the vehicle page populates even without items
      const url = new URL(req.url);
      const qs = odo ? `?odometer=${odo}` : "";
      fetch(`${url.origin}/api/vehicle/analyze/${encodeURIComponent(vin)}${qs}`, {
        method: "POST"
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      vin,
      odometer: odo,
      ro,
      recommendations_upserted: recs.length,
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Error", stack: e?.stack }, { status: 500 });
  }
}
