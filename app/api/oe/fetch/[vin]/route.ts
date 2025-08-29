import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const toStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
const bool = (v?: string | null) =>
  ["1", "true", "yes", "on"].includes(String(v ?? "").toLowerCase());
const intOrNull = (v?: string | null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- name sanitizer (fixes entries like "\"Inspect brake pads") ---
function cleanName(raw: any) {
  const s = toStr(raw).trim();
  // strip leading/trailing straight quotes or backticks, then collapse inner whitespace
  return s.replace(/^['"`]+/, "").replace(/['"`]+$/, "").replace(/\s{2,}/g, " ").trim();
}

// Normalize one service object (works for both schemas)
function normalizeService(doc: any) {
  const category =
    doc.category ?? doc.Category ?? doc.component ?? doc.Component ?? "General";

  const rawName =
    doc.name ??
    doc.Name ??
    doc.service ??
    doc.Service ??
    doc.maintenance ??
    doc.Description ??
    "Unknown Service";

  const name = cleanName(rawName);

  // intervals (support embedded array or miles/months pair)
  let intervals: any[] = Array.isArray(doc.intervals) ? doc.intervals : [];
  if (!intervals.length) {
    const miles = doc.miles ?? doc.interval_miles ?? null;
    const months = doc.months ?? doc.interval_months ?? null;
    if (miles || months) {
      intervals = [
        {
          type: "Every",
          value: miles ?? months,
          units: miles ? "Miles" : "Months",
          initial: 0,
        },
      ];
    }
  }

  const scheduleName =
    doc?.schedule?.name ??
    doc?.ScheduleName ??
    (doc?.isEvery ? "Every" : doc?.isAt ? "At" : undefined);

  return {
    category,
    name,
    schedule: scheduleName ? { name: scheduleName } : undefined,
    intervals,
    notes: doc.notes ?? null,
    eng_notes: doc.eng_notes ?? null,
    trans_notes: doc.trans_notes ?? null,
    trim_notes: doc.trim_notes ?? null,
  };
}

// Only exclude when the text explicitly mentions a component
function shouldInclude(
  svc: any,
  filters: {
    fuel?: string;
    trans?: string;
    drivetrain?: string;
    hasFrontDiff: boolean;
    hasRearDiff: boolean;
    hasTransferCase: boolean;
  }
) {
  const nm = `${svc.category} ${svc.name}`.toLowerCase();

  // Fuel
  if (filters.fuel === "gas" && /diesel/.test(nm)) return false;
  if (filters.fuel === "diesel" && /\bgas(oline)?\b/.test(nm)) return false;
  if (filters.fuel === "ev" && /(engine|oil|spark plug|fuel|gasoline|diesel)/.test(nm))
    return false;

  // Transmission
  if (filters.trans === "automatic" && /manual/.test(nm)) return false;
  if (filters.trans === "manual" && /automatic/.test(nm)) return false;

  // Drivetrain / axles
  const mentionsFrontDiff = /(front diff|front differential)/i.test(nm);
  const mentionsRearDiff = /(rear diff|rear differential)/i.test(nm);
  const mentionsTcase = /(transfer case)/i.test(nm);
  const mentions4wdAwd = /\b(4wd|awd)\b/i.test(nm);

  if (mentionsFrontDiff && !filters.hasFrontDiff) return false;
  if (mentionsRearDiff && !filters.hasRearDiff) return false;
  if (mentionsTcase && !filters.hasTransferCase) return false;

  if (mentions4wdAwd && !/\b(4wd|awd)\b/i.test(filters.drivetrain ?? "")) return false;

  return true;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> }
) {
  try {
    const { vin: vinRaw } = await params;
    const vin = (vinRaw || "").trim().toUpperCase();
    if (vin.length !== 17)
      return NextResponse.json(
        { error: "VIN must be 17 characters" },
        { status: 400 }
      );

    const url = new URL(req.url);
    const schedule = (url.searchParams.get("schedule") || "normal").toLowerCase();

    let year = intOrNull(url.searchParams.get("year"));
    let make = toStr(url.searchParams.get("make")).trim();
    let model = toStr(url.searchParams.get("model")).trim();

    const fuel = toStr(url.searchParams.get("fuel")).toLowerCase() || undefined;
    const trans = toStr(url.searchParams.get("trans")).toLowerCase() || undefined;
    let drivetrain = toStr(url.searchParams.get("drivetrain")).toLowerCase() || undefined;

    let hasFrontDiff = bool(url.searchParams.get("hasFrontDiff"));
    let hasRearDiff = bool(url.searchParams.get("hasRearDiff"));
    let hasTransferCase = bool(url.searchParams.get("hasTransferCase"));

    // Fill missing Y/M/M from Prisma
    if (!year || !make || !model || !drivetrain) {
      const v = await prisma.vehicle.findUnique({
        where: { vin },
        select: { year: true, make: true, model: true },
      });
      if (v) {
        year = year ?? ((v.year ?? undefined) as any);
        make = make || toStr(v.make);
        model = model || toStr(v.model);
      }
    }

    // Derive axle flags if not explicitly provided
    if (!hasFrontDiff && !hasRearDiff && !hasTransferCase) {
      const d = drivetrain ?? "";
      if (d === "rwd") hasRearDiff = true;
      else if (d === "fwd") hasFrontDiff = true;
      else if (d === "4wd") {
        hasFrontDiff = true;
        hasRearDiff = true;
        hasTransferCase = true;
      } else if (d === "awd") {
        hasFrontDiff = true;
        hasRearDiff = true;
      }
    }

    const filtersApplied = {
      fuel,
      trans,
      drivetrain,
      turbo: bool(url.searchParams.get("turbo")),
      supercharged: bool(url.searchParams.get("supercharged")),
      cylinders: intOrNull(url.searchParams.get("cylinders")) || 0,
      liters: Number(url.searchParams.get("liters")) || 0,
      schedule,
      hasFrontDiff,
      hasRearDiff,
      hasTransferCase,
    };

    if (!year || !make || !model) {
      return NextResponse.json(
        {
          vin,
          schedule,
          filtersApplied,
          totalBefore: 0,
          totalAfter: 0,
          services: [],
          warning: "Missing year/make/model",
        },
        { status: 200 }
      );
    }

    const db = await getDb();
    const keyMake = make.toLowerCase();
    const keyModel = model.toLowerCase();

    // Try `oeschedules` first (doc-per-YMM with embedded services)
    const oeDoc =
      (await db.collection("oeschedules").findOne(
        { make_key: keyMake, model_key: keyModel, year },
        { projection: { _id: 0, services: 1 } }
      )) ||
      (await db.collection("oeschedules").findOne(
        {
          year,
          make: { $regex: `^${esc(make)}$`, $options: "i" },
          model: { $regex: `^${esc(model)}$`, $options: "i" },
        },
        { projection: { _id: 0, services: 1 } }
      ));

    let rawServices: any[] = [];
    let source = "";

    if (oeDoc && Array.isArray(oeDoc.services)) {
      rawServices = oeDoc.services;
      source = "oeschedules";
    } else {
      // Fallback to `services_by_ymm`
      const docs = await db
        .collection("services_by_ymm")
        .find({
          year,
          make: { $regex: `^${esc(make)}$`, $options: "i" },
          model: { $regex: `^${esc(model)}$`, $options: "i" },
        })
        .limit(5000)
        .toArray();

      if (docs.length === 1 && Array.isArray((docs[0] as any).services)) {
        // Aggregated shape: one doc with services[]
        rawServices = (docs[0] as any).services;
      } else {
        // Per-service shape: many docs, each is a service row
        rawServices = docs;
      }
      source = "services_by_ymm";
    }

    const totalBefore = rawServices.length;
    if (!totalBefore) {
      return NextResponse.json(
        {
          vin,
          schedule,
          filtersApplied,
          totalBefore: 0,
          totalAfter: 0,
          services: [],
          _debug: { db: db.databaseName, source },
        },
        { status: 200 }
      );
    }

    const normalized = rawServices.map(normalizeService);
    const filtered = normalized.filter((svc) =>
      shouldInclude(svc, {
        fuel,
        trans,
        drivetrain,
        hasFrontDiff,
        hasRearDiff,
        hasTransferCase,
      })
    );

    return NextResponse.json(
      {
        vin,
        schedule,
        filtersApplied,
        totalBefore,
        totalAfter: filtered.length,
        services: filtered,
        _debug: { db: db.databaseName, source },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal Error", stack: e?.stack },
      { status: 500 }
    );
  }
}
