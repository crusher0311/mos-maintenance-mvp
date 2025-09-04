// app/api/autoflow/sync/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Pulls vehicles (VIN + mileage) from Autoflow (or POST body/demo),
 * then enriches each one with:
 *  - next-due info (via Express /api/vin-next-due)
 *  - optional analysis (via /api/maintenance/analyze/[vin])
 *
 * Env you can set in .env.local:
 *   AUTOFLOW_BASE_URL="https://api.autoflow.example"
 *   AUTOFLOW_API_KEY="xxxxx"
 *   AUTOFLOW_ACCOUNT_ID="your-account-id"  // optional
 *   EXPRESS_BASE_URL="http://localhost:3001"  // default
 */

const AUTOFLOW_BASE_URL = process.env.AUTOFLOW_BASE_URL || "";
const AUTOFLOW_API_KEY = process.env.AUTOFLOW_API_KEY || "";
const AUTOFLOW_ACCOUNT_ID = process.env.AUTOFLOW_ACCOUNT_ID || "";
const EXPRESS_BASE = process.env.EXPRESS_BASE_URL || "http://localhost:3001";

type RawVehicle = Record<string, any>;

type NormalizedVehicle = {
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  odometer?: number;          // miles
  monthsInService?: number;   // months
  schedule?: "normal" | "severe";
  trans?: "automatic" | "manual" | "";
};

type Enriched = NormalizedVehicle & {
  nextDue?: any;
  analysis?: any;
  errors?: string[];
};

const parseIntSafe = (v: any) => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const m = v.replace(/[^0-9.-]/g, "");
    const n = Number(m);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }
  return undefined;
};

const monthsBetween = (fromISO?: string | Date): number | undefined => {
  if (!fromISO) return undefined;
  const d0 = new Date(fromISO);
  if (isNaN(d0.getTime())) return undefined;
  const d1 = new Date();
  return (d1.getFullYear() - d0.getFullYear()) * 12 + (d1.getMonth() - d0.getMonth());
};

function normalizeAutoflowVehicle(x: RawVehicle): NormalizedVehicle | null {
  // Try lots of common field names weâ€™ve seen
  const vin =
    (x.vin || x.VIN || x.vehicleVin || x.VehicleVIN || "").toString().trim().toUpperCase();
  if (!vin || vin.length !== 17) return null;

  const odometer =
    parseIntSafe(x.odometer ?? x.mileage ?? x.currentMileage ?? x.odometerReading ?? x.Odometer);

  const monthsInService =
    x.monthsInService ??
    monthsBetween(
      x.inServiceDate ??
        x.firstServiceDate ??
        x.deliveryDate ??
        x.dateInService ??
        x.vehicleInServiceDate
    );

  const year = parseIntSafe(x.year ?? x.Year);
  const make = (x.make ?? x.Make)?.toString();
  const model = (x.model ?? x.Model)?.toString();

  let transRaw = (x.trans ?? x.transmission ?? x.Transmission ?? "").toString().toLowerCase();
  let trans: "automatic" | "manual" | "" = "";
  if (/manual/.test(transRaw)) trans = "manual";
  else if (/auto/.test(transRaw)) trans = "automatic";

  let schedule: "normal" | "severe" | undefined;
  const schedRaw = (x.schedule ?? x.maintenanceSchedule ?? "").toString().toLowerCase();
  if (schedRaw === "severe" || /severe/.test(schedRaw)) schedule = "severe";
  else if (schedRaw === "normal" || /normal/.test(schedRaw)) schedule = "normal";

  return { vin, year, make, model, odometer, monthsInService, schedule, trans };
}

async function getAutoflowVehicles(url: URL): Promise<NormalizedVehicle[]> {
  // 1) Demo mode
  if ((url.searchParams.get("demo") || "").toLowerCase() === "1") {
    return [
      {
        vin: "JH4DA9340LS000000",
        year: 1990,
        make: "Acura",
        model: "Integra",
        odometer: 61234,
        monthsInService: 0,
        schedule: "normal",
        trans: "",
      },
      {
        vin: "1FTFW1E64CFB09199",
        year: 2012,
        make: "FORD",
        model: "F-150 PLATINUM",
        odometer: 200000,
        monthsInService: 156,
        schedule: "severe",
        trans: "automatic",
      },
    ];
  }

  // 2) POST body with { vehicles: [...] }
  try {
    const method = url.searchParams.get("_method") || ""; // convenience
    // will be handled by the route POST/GET wrappers below
  } catch (_) {}

  // 3) Pull from Autoflow (generic proxy â€“ adjust path if needed)
  if (!AUTOFLOW_BASE_URL || !AUTOFLOW_API_KEY) {
    return [];
  }

  // Basic example: GET /vehicles?sinceDays=<n>&accountId=<id>
  const sinceDays = parseIntSafe(url.searchParams.get("sinceDays")) ?? 7;
  const q = new URL(`${AUTOFLOW_BASE_URL.replace(/\/+$/, "")}/vehicles`);
  q.searchParams.set("sinceDays", String(sinceDays));
  if (AUTOFLOW_ACCOUNT_ID) q.searchParams.set("accountId", AUTOFLOW_ACCOUNT_ID);

  const res = await fetch(q.toString(), {
    headers: { Authorization: `Bearer ${AUTOFLOW_API_KEY}` },
    cache: "no-store",
  });

  const rawText = await res.text();
  let raw: any;
  try {
    raw = JSON.parse(rawText);
  } catch {
    raw = rawText;
  }
  if (!res.ok) {
    console.warn("Autoflow fetch failed:", res.status, rawText?.slice?.(0, 400));
    return [];
  }

  // Try to find a list in common shapes
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.vehicles)
    ? raw.vehicles
    : Array.isArray(raw?.data)
    ? raw.data
    : [];

  const normalized = list
    .map(normalizeAutoflowVehicle)
    .filter(Boolean) as NormalizedVehicle[];

  // Dedup by VIN
  const seen = new Set<string>();
  return normalized.filter(v => (seen.has(v.vin) ? false : (seen.add(v.vin), true)));
}

async function fetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch { j = t; }
  return { ok: r.ok, status: r.status, body: j };
}

async function enrichOne(
  baseOrigin: string,
  v: NormalizedVehicle,
  opts: { withAnalysis: boolean; horizonMi: number; horizonMo: number }
): Promise<Enriched> {
  const errors: string[] = [];
  const schedule = v.schedule || "normal";
  const trans = v.trans || "";
  const odometer = v.odometer ?? 0;
  const monthsInService = v.monthsInService ?? 0;

  // 1) Next-due from Express
  const nextDueUrl = new URL(`${EXPRESS_BASE}/api/vin-next-due`);
  nextDueUrl.searchParams.set("vin", v.vin);
  nextDueUrl.searchParams.set("odometer", String(odometer));
  if (monthsInService) nextDueUrl.searchParams.set("monthsInService", String(monthsInService));
  nextDueUrl.searchParams.set("schedule", schedule);
  if (trans) nextDueUrl.searchParams.set("trans", trans);
  nextDueUrl.searchParams.set("horizonMiles", String(opts.horizonMi));
  nextDueUrl.searchParams.set("horizonMonths", String(opts.horizonMo));

  let nextDue: any = null;
  try {
    const res = await fetchJson(nextDueUrl.toString());
    nextDue = res.body;
    if (!res.ok) errors.push(`next-due ${res.status}`);
  } catch (e: any) {
    errors.push(`next-due error: ${String(e)}`);
  }

  // 2) Optional analysis via Next
  let analysis: any = null;
  if (opts.withAnalysis) {
    const anaUrl = new URL(`${baseOrigin}/api/maintenance/analyze/${v.vin}`);
    anaUrl.searchParams.set("odometer", String(odometer));
    if (monthsInService) anaUrl.searchParams.set("monthsInService", String(monthsInService));
    anaUrl.searchParams.set("schedule", schedule);
    if (trans) anaUrl.searchParams.set("trans", trans);
    anaUrl.searchParams.set("horizonMiles", String(opts.horizonMi));
    anaUrl.searchParams.set("horizonMonths", String(opts.horizonMo));
    try {
      const res = await fetchJson(anaUrl.toString());
      analysis = res.body;
      if (!res.ok) errors.push(`analyze ${res.status}`);
    } catch (e: any) {
      errors.push(`analyze error: ${String(e)}`);
    }
  }

  return { ...v, nextDue, analysis, errors: errors.length ? errors : undefined };
}

async function enrichMany(
  baseOrigin: string,
  vehicles: NormalizedVehicle[],
  withAnalysis: boolean,
  horizonMi: number,
  horizonMo: number
): Promise<Enriched[]> {
  // simple concurrency limiter
  const max = 5;
  const out: Enriched[] = [];
  for (let i = 0; i < vehicles.length; i += max) {
    const batch = vehicles.slice(i, i + max);
    const results = await Promise.all(
      batch.map(v => enrichOne(baseOrigin, v, { withAnalysis, horizonMi, horizonMo }))
    );
    out.push(...results);
  }
  return out;
}

// -------- Route handlers --------

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const withAnalysis = /^(1|true|yes)$/i.test(url.searchParams.get("withAnalysis") || "0");
    const horizonMi = parseIntSafe(url.searchParams.get("horizonMiles")) ?? 2000;
    const horizonMo = parseIntSafe(url.searchParams.get("horizonMonths")) ?? 2;

    // Prefer POST body vehicles if provided
    let vehicles: NormalizedVehicle[] = [];
    try {
      const body = await req.json().catch(() => null);
      if (body?.vehicles && Array.isArray(body.vehicles)) {
        vehicles = (body.vehicles as any[])
          .map(normalizeAutoflowVehicle)
          .filter(Boolean) as NormalizedVehicle[];
      }
    } catch {}

    if (!vehicles.length) {
      vehicles = await getAutoflowVehicles(url);
    }

    if (!vehicles.length) {
      return NextResponse.json(
        { message: "No vehicles found from Autoflow or POST body.", vehicles: [] },
        { status: 200 }
      );
    }

    const enriched = await enrichMany(url.origin, vehicles, withAnalysis, horizonMi, horizonMo);

    return NextResponse.json(
      {
        meta: {
          count: enriched.length,
          withAnalysis,
          horizon: { miles: horizonMi, months: horizonMo },
          expressBase: EXPRESS_BASE,
          source: vehicles === (await getAutoflowVehicles(url)) ? "autoflow" : "post",
        },
        vehicles: enriched,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Allow quick GET testing (demo/autoflow)
  return POST(req);
}

