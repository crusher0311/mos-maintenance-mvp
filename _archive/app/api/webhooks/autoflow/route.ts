import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Toggle: if a status event has no line items, auto-run analyzer
const ANALYZE_ON_STATUS = process.env.ANALYZE_ON_STATUS === "1";

// ---------- helpers ----------
const toStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
const digits = (v: any) => toStr(v).replace(/[^0-9]/g, "");
const isObj = (x: any) => x && typeof x === "object" && !Array.isArray(x);
const arr = (x: any) => (Array.isArray(x) ? x : x == null ? [] : [x]);

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
    case "past_due": return "overdue";
    case "recommended":
    case "open":
    case "approved":
    case "needs_service":
    case "fail":
    case "red":
    case "critical":
      return "due";
    case "declined":
    case "deferred": return "not_yet";
    case "completed":
    case "done":
    case "closed":
    case "ok":
    case "pass":
    case "green":
      return "not_yet";
    case "yellow":
    case "monitor":
    case "needs_attention":
      return "coming_soon";
    default:
      return "coming_soon";
  }
}

function pickNameLoose(o: any): string {
  // Common DVI & RO fields we see in the wild
  return (
    toStr(o?.name) ||
    toStr(o?.title) ||
    toStr(o?.operation) ||
    toStr(o?.op) ||
    toStr(o?.service) ||
    toStr(o?.serviceName) ||
    toStr(o?.description) ||
    toStr(o?.label) ||
    toStr(o?.subject) ||
    toStr(o?.inspectionItem?.name) ||      // nested
    toStr(o?.recommendation?.name) ||      // nested
    toStr(o?.item?.name) ||                 // nested
    ""
  ).trim();
}
function pickNotes(o: any): string | null {
  const note =
    o?.notes ??
    o?.comment ??
    o?.techNotes ??
    o?.customerNotes ??
    o?.reason ??
    o?.recommendation ??
    o?.finding ??
    o?.findings ??
    null;
  return note == null ? null : toStr(note);
}

// ---------- DVI-aware extraction ----------
function extractFromDVI(root: any) {
  const out: Array<{ name: string; status: string; notes: string | null }> = [];
  if (!isObj(root)) return out;

  // Flat places first
  const flatKeys = ["recommendations", "items", "lineItems", "serviceItems"];
  for (const k of flatKeys) {
    for (const it of arr(root?.[k])) {
      const name = pickNameLoose(it);
      if (!name) continue;
      const status = mapStatus(it?.status ?? it?.state ?? root?.status ?? "");
      out.push({ name, status, notes: pickNotes(it) });
    }
  }

  // Nested typical DVI layouts
  // sections[].items[], groups[].items[], checklists[].items[], checklist.items[], inspectionItems[]
  for (const section of arr(root?.sections)) {
    for (const it of arr(section?.items)) {
      const name = pickNameLoose(it);
      if (!name) continue;
      const status = mapStatus(it?.status ?? it?.result ?? it?.state ?? section?.status ?? root?.status ?? "");
      out.push({ name, status, notes: pickNotes(it) });
    }
  }
  for (const grp of arr(root?.groups)) {
    for (const it of arr(grp?.items)) {
      const name = pickNameLoose(it);
      if (!name) continue;
      const status = mapStatus(it?.status ?? it?.result ?? it?.state ?? grp?.status ?? root?.status ?? "");
      out.push({ name, status, notes: pickNotes(it) });
    }
  }
  for (const cl of arr(root?.checklists)) {
    for (const it of arr(cl?.items)) {
      const name = pickNameLoose(it);
      if (!name) continue;
      const status = mapStatus(it?.status ?? it?.result ?? it?.state ?? cl?.status ?? root?.status ?? "");
      out.push({ name, status, notes: pickNotes(it) });
    }
  }
  for (const it of arr(root?.checklist?.items)) {
    const name = pickNameLoose(it);
    if (!name) continue;
    const status = mapStatus(it?.status ?? it?.result ?? it?.state ?? root?.status ?? "");
    out.push({ name, status, notes: pickNotes(it) });
  }
  for (const it of arr(root?.inspectionItems)) {
    const name = pickNameLoose(it);
    if (!name) continue;
    const status = mapStatus(it?.status ?? it?.result ?? it?.state ?? root?.status ?? "");
    out.push({ name, status, notes: pickNotes(it) });
  }

  return out;
}

// Normalize from generic + DVI specific shapes
function extractRecsFromBody(body: any) {
  const recs: Array<{ name: string; status: string; notes: string | null }> = [];

  // Generic arrays we already handled
  const genericKeys = ["recommendations", "services", "serviceItems", "lineItems", "operations", "items"];
  for (const key of genericKeys) {
    const arrAny = (Array.isArray(body?.[key]) && body[key]) ||
                   (Array.isArray(body?.data?.[key]) && body.data[key]) ||
                   null;
    if (!arrAny) continue;
    for (const it of arrAny as any[]) {
      const name = pickNameLoose(it);
      if (!name) continue; // require a real name
      const status = mapStatus(it?.status ?? it?.state ?? body?.status ?? "");
      recs.push({ name, status, notes: pickNotes(it) });
    }
  }

  // DVI roots in a few common places
  const dviRoots = [
    body?.dvi, body?.data?.dvi,
    body?.inspection, body?.data?.inspection,
    body?.payload?.dvi, body?.payload?.inspection,
  ].filter(isObj);

  for (const root of dviRoots) {
    recs.push(...extractFromDVI(root));
  }

  // Dedup
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

    const vin = pickVin(body);
    if (!vin) return NextResponse.json({ error: "VIN missing/invalid" }, { status: 400 });
    const odo = pickOdometer(body);
    const ro  = pickRO(body);

    // Upsert vehicle
    await prisma.vehicle.upsert({
      where: { vin },
      create: {
        vin,
        year: Number.isFinite(body?.vehicle?.year)
          ? body.vehicle.year
          : Number.isFinite(body?.data?.vehicle?.year)
          ? body.data.vehicle.year
          : null,
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

    // Log the raw event (make sure type is a string)
    await prisma.vehicleEvent.create({
      data: {
        vehicleVin: vin,
        type: toStr(body?.type ?? body?.event?.type ?? body?.event ?? "status_change"),
        source: toStr(body?.source || "autoflow"),
        payload: { ...body, _extracted: { vin, odometer: odo, ro } },
      },
    });

    // Extract & save named recommendations
    const recs = extractRecsFromBody(body).filter(r => r.name);
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
      // Populate via analyzer if no items were present
      const url = new URL(req.url);
      const qs = odo ? `?odometer=${odo}` : "";
      fetch(`${url.origin}/api/vehicle/analyze/${encodeURIComponent(vin)}${qs}`, {
        method: "POST",
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
