// app/api/vehicle/inspect/[vin]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ---------------- helpers ---------------- */
const toStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
const digits = (v: any) => toStr(v).replace(/[^0-9]/g, "");
const isObj = (x: any) => x && typeof x === "object" && !Array.isArray(x);
const arr = (x: any) => (Array.isArray(x) ? x : x == null ? [] : [x]);

const bool = (v?: string | null) =>
  ["1", "true", "yes", "on"].includes(String(v ?? "").toLowerCase());
const intParam = (v: string | null, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

async function getJson<T = any>(url: string): Promise<{ ok: boolean; status: number; body: T | any; }> {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { ok: res.ok, status: res.status, body: parsed };
}
async function postJson<T = any>(url: string, body: any): Promise<{ ok: boolean; status: number; body: T | any; }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { ok: res.ok, status: res.status, body: parsed };
}

function pickNameLoose(o: any): string {
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
    toStr(o?.inspectionItem?.name) ||
    toStr(o?.recommendation?.name) ||
    toStr(o?.item?.name) ||
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

function parseOdo(s?: string) {
  return s ? parseInt(s.replace(/[^0-9]/g, ""), 10) : undefined;
}
function sortByDateDesc<T extends { displayDate?: string }>(recs: T[]) {
  return [...recs].sort(
    (a, b) =>
      new Date(b.displayDate || 0).getTime() - new Date(a.displayDate || 0).getTime()
  );
}
function estimateMilesPerDayFromCarfax(records: Array<{ displayDate: string; odometer?: string; odometerNum?: number; }>): number | null {
  const withOdo = sortByDateDesc(records).filter(
    (r) => typeof r.odometerNum === "number" || r.odometer
  );
  if (withOdo.length < 2) return null;
  const a = withOdo[0], b = withOdo[1];
  const odoA = typeof a.odometerNum === "number" ? a.odometerNum : parseOdo(a.odometer);
  const odoB = typeof b.odometerNum === "number" ? b.odometerNum : parseOdo(b.odometer);
  if (typeof odoA !== "number" || typeof odoB !== "number") return null;
  const days =
    (new Date(a.displayDate).getTime() - new Date(b.displayDate || 0).getTime()) / (1000 * 60 * 60 * 24);
  return days > 0 ? (odoA - odoB) / days : null;
}

/* --------- extraction preview from events (no DB writes) --------- */
function extractFromDVI(root: any) {
  const out: Array<{ name: string; status: string; notes: string | null }> = [];
  if (!isObj(root)) return out;

  const flatKeys = ["recommendations", "items", "lineItems", "serviceItems"];
  for (const k of flatKeys) {
    for (const it of arr(root?.[k])) {
      const name = pickNameLoose(it);
      if (!name) continue;
      const status = mapStatus(it?.status ?? it?.state ?? root?.status ?? "");
      out.push({ name, status, notes: pickNotes(it) });
    }
  }
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
function extractRecsFromEventPayload(body: any) {
  const recs: Array<{ name: string; status: string; notes: string | null }> = [];

  const genericKeys = ["recommendations", "services", "serviceItems", "lineItems", "operations", "items"];
  for (const key of genericKeys) {
    const arrAny =
      (Array.isArray(body?.[key]) && body[key]) ||
      (Array.isArray(body?.data?.[key]) && body.data[key]) ||
      null;
    if (!arrAny) continue;
    for (const it of arrAny as any[]) {
      const name = pickNameLoose(it);
      if (!name) continue;
      const status = mapStatus(it?.status ?? it?.state ?? body?.status ?? "");
      recs.push({ name, status, notes: pickNotes(it) });
    }
  }

  const dviRoots = [
    body?.dvi, body?.data?.dvi,
    body?.inspection, body?.data?.inspection,
    body?.payload?.dvi, body?.payload?.inspection,
  ].filter(isObj);

  for (const root of dviRoots) {
    recs.push(...extractFromDVI(root));
  }

  // dedupe
  const seen = new Set<string>();
  const out: typeof recs = [];
  for (const r of recs) {
    const k = `${r.name}::${r.status}::${r.notes ?? ""}`;
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out;
}

function truncateJSON(obj: any, max = 2000) {
  let s: string;
  try { s = JSON.stringify(obj); } catch { s = String(obj); }
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/* ---------------- route ---------------- */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> } // ← await params (fixes Next.js warning)
) {
  try {
    const { vin: vinRaw } = await params;
    const vin = (vinRaw || "").trim().toUpperCase();
    if (vin.length !== 17) {
      return NextResponse.json({ error: "VIN must be 17 characters", vin }, { status: 400 });
    }

    const url = new URL(req.url);

    // controls
    const includeRaw     = bool(url.searchParams.get("raw"));           // ?raw=1 to include full payload JSON blocks
    const limit          = intParam(url.searchParams.get("limit"), 10); // number of events to include
    const schedule       = (url.searchParams.get("schedule") || "normal").toLowerCase(); // normal|severe
    const transRaw       = (url.searchParams.get("trans") || "").toLowerCase();
    const trans          = transRaw === "manual" ? "manual" : transRaw === "automatic" ? "automatic" : "";
    const odometerQ      = url.searchParams.has("odometer") ? intParam(url.searchParams.get("odometer"), 0) : undefined;
    const horizonMiles   = intParam(url.searchParams.get("horizonMiles"), 3000);
    const horizonMonths  = intParam(url.searchParams.get("horizonMonths"), 2);
    const includeAnalysis= bool(url.searchParams.get("analyze")); // ?analyze=1 to also call analyzer

    // rich attribute filters to forward to OE + analyzer
    const fuel          = toStr(url.searchParams.get("fuel") ?? "").toLowerCase() || undefined; // gas|diesel|ev
    const drivetrain    = toStr(url.searchParams.get("drivetrain") ?? "").toLowerCase() || undefined; // rwd|fwd|awd|4wd
    const year          = toStr(url.searchParams.get("year") ?? "");
    const make          = toStr(url.searchParams.get("make") ?? "");
    const model         = toStr(url.searchParams.get("model") ?? "");
    const turbo         = bool(url.searchParams.get("turbo")) ? "1" : "";
    const supercharged  = bool(url.searchParams.get("supercharged")) ? "1" : "";
    const cylinders     = toStr(url.searchParams.get("cylinders") ?? "");
    const liters        = toStr(url.searchParams.get("liters") ?? "");
    const hasFrontDiff  = bool(url.searchParams.get("hasFrontDiff"));
    const hasRearDiff   = bool(url.searchParams.get("hasRearDiff"));
    const hasTransferCase = bool(url.searchParams.get("hasTransferCase"));
    const explainOe     = bool(url.searchParams.get("explain"));

    // DB pulls
    const [vehicle, recs, events] = await Promise.all([
      prisma.vehicle.findUnique({
        where: { vin },
        select: { vin: true, year: true, make: true, model: true, trim: true, odometer: true, updatedAt: true },
      }),
      prisma.serviceRecommendation.findMany({
        where: { vehicleVin: vin },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, status: true, notes: true, source: true, updatedAt: true },
      }),
      prisma.vehicleEvent.findMany({
        where: { vehicleVin: vin },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, createdAt: true, source: true, type: true, payload: true },
      }),
    ]);

    // Build event inspection
    const eventViews = events.map((e) => {
      const preview = extractRecsFromEventPayload(e.payload);
      return {
        id: e.id,
        createdAt: e.createdAt,
        source: e.source,
        type: typeof e.type === "string" ? e.type : JSON.stringify(e.type),
        extractionPreview: preview,
        payload: includeRaw ? e.payload : undefined,
        payloadSnippet: includeRaw ? undefined : truncateJSON(e.payload, 2000),
      };
    });

    // Aggregate preview counts
    const previewAll = eventViews.flatMap((v) => v.extractionPreview);
    const previewCounts = previewAll.reduce((acc: Record<string, number>, r) => {
      const k = (r.status || "unknown").toUpperCase();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    // ---- CARFAX (local route) ----
    const carfaxRes = await postJson<any>(`${url.origin}/api/carfax/fetch/${encodeURIComponent(vin)}?raw=1`, {});
    const displayRecordsRaw: any[] =
      Array.isArray(carfaxRes.body?.serviceHistory?.displayRecords) ? carfaxRes.body.serviceHistory.displayRecords : [];
    const carfaxDisplayRecords = displayRecordsRaw.map((r: any) => ({
      ...r,
      odometerNum: typeof r?.odometerNum === "number" ? r.odometerNum : parseOdo(r?.odometer),
    }));
    const mpdEstimate = estimateMilesPerDayFromCarfax(carfaxDisplayRecords);
    const lastCarfaxDate = sortByDateDesc(carfaxDisplayRecords)[0]?.displayDate || null;

    // ---- OE/DataOne (local proxy) ----
    const oeQs = new URLSearchParams({
      schedule,
      ...(fuel ? { fuel } : {}),
      ...(trans ? { trans } : {}),
      ...(drivetrain ? { drivetrain } : {}),
      ...(turbo ? { turbo: "1" } : {}),
      ...(supercharged ? { supercharged: "1" } : {}),
      ...(cylinders ? { cylinders } : {}),
      ...(liters ? { liters } : {}),
      ...(year ? { year } : {}),
      ...(make ? { make } : {}),
      ...(model ? { model } : {}),
      ...(hasFrontDiff ? { hasFrontDiff: "1" } : {}),
      ...(hasRearDiff ? { hasRearDiff: "1" } : {}),
      ...(hasTransferCase ? { hasTransferCase: "1" } : {}),
      ...(explainOe ? { explain: "1" } : {}),
    }).toString();

    const oeRes = await getJson<any>(`${url.origin}/api/oe/fetch/${encodeURIComponent(vin)}?${oeQs}`);
    const oeServices: any[] = Array.isArray(oeRes.body?.services) ? oeRes.body.services : [];
    const oeSummary = {
      total: oeServices.length,
      bySchedule: oeServices.reduce((acc: Record<string, number>, s: any) => {
        const key = (s?.schedule?.name || "Unknown").toString();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      names: oeServices.map(s => s?.name).filter(Boolean),
    };

    // ---- Analyzer (optional) ----
    const odometerUsed = odometerQ ?? vehicle?.odometer ?? 0;
    let analysis: any = null;
    if (includeAnalysis) {
      const qs = new URLSearchParams({
        odometer: String(odometerUsed || 0),
        schedule,
        horizonMiles: String(horizonMiles),
        horizonMonths: String(horizonMonths),
        ...(trans ? { trans } : {}),
        ...(fuel ? { fuel } : {}),
        ...(drivetrain ? { drivetrain } : {}),
        ...(year ? { year } : {}),
        ...(make ? { make } : {}),
        ...(model ? { model } : {}),
      });
      const analyzeUrl = `${url.origin}/api/maintenance/analyze/${encodeURIComponent(vin)}?${qs.toString()}`;
      const aRes = await getJson<any>(analyzeUrl);
      analysis = { ok: aRes.ok, status: aRes.status, body: aRes.body };
    }

    // Saved counts
    const savedCounts = recs.reduce((acc: Record<string, number>, r) => {
      const k = (r.status || "unknown").toUpperCase();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      vin,
      inputs: {
        schedule,
        trans: trans || null,
        fuel: fuel || null,
        drivetrain: drivetrain || null,
        year: year || null,
        make: make || null,
        model: model || null,
        turbo: !!turbo,
        supercharged: !!supercharged,
        cylinders: cylinders || null,
        liters: liters || null,
        hasFrontDiff,
        hasRearDiff,
        hasTransferCase,
        odometerUsed,
        horizonMiles,
        horizonMonths,
      },
      vehicle,
      saved: {
        counts: savedCounts,
        recommendations: recs,
      },
      events: eventViews,
      preview: {
        counts: previewCounts,
        items: previewAll,
      },
      carfax: {
        ok: carfaxRes.ok,
        status: carfaxRes.status,
        summary: {
          lastRecordDate: lastCarfaxDate,
          milesPerDayEstimate: mpdEstimate,
          recordCount: carfaxDisplayRecords.length,
        },
        displayRecords: includeRaw ? carfaxDisplayRecords : undefined,
        note: includeRaw ? "Full CARFAX records included" : "Add ?raw=1 to include full CARFAX displayRecords",
      },
      oe: {
        ok: oeRes.ok,
        status: oeRes.status,
        summary: oeSummary,
        services: includeRaw ? oeServices : undefined,
        note: includeRaw ? "Full OE services included" : "Add ?raw=1 to include full OE services",
      },
      analysis, // present only if ?analyze=1
      note: includeRaw
        ? "Raw payloads included. Use ?limit=N to control event count."
        : "Payloads are truncated. Append ?raw=1 to include full payloads. Use ?limit=N to control event count.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Error", stack: e?.stack }, { status: 500 });
  }
}
