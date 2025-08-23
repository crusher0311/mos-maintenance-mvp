// /app/api/maintenance/analyze/[vin]/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Adds:
 * - 24h in-memory cache for Vehicle Databases and OpenAI (configurable)
 * - Graceful fallbacks (return CARFAX-only if VD/OpenAI fails)
 * - Env-configurable thresholds for "coming soon"
 * - Masked logging for secrets
 * - Updated OpenAI prompt: "You are an automotive expert..."
 * - Vehicle Databases 429 retry with Retry-After awareness (up to 5 tries)
 */

const CARFAX_LOCAL_ENDPOINT =
  process.env.CARFAX_LOCAL_ENDPOINT || "http://localhost:3000/api/carfax/fetch";

const VEHICLE_DATABASES_API_KEY = process.env.VEHICLE_DATABASES_API_KEY || "";
const VEHICLE_DATABASES_BASE =
  process.env.VEHICLE_DATABASES_BASE || "https://api.vehicledatabases.com";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Thresholds (env override)
const DEFAULT_MPD = 30;
const COMING_SOON_MILES = Number(process.env.COMING_SOON_MILES ?? 1500);
const COMING_SOON_DAYS = Number(process.env.COMING_SOON_DAYS ?? 60);

// Simple TTL caches (in-memory)
type CacheEntry<T> = { at: number; data: T };
const DAY_MS = 24 * 60 * 60 * 1000;
const VD_CACHE_TTL_MS = Number(process.env.VD_CACHE_TTL_MS ?? DAY_MS);
const OA_CACHE_TTL_MS = Number(process.env.OA_CACHE_TTL_MS ?? DAY_MS);

const g = globalThis as any;
g.__vd_cache ||= new Map<string, CacheEntry<any>>();
g.__oa_cache ||= new Map<string, CacheEntry<any>>();
const VD_CACHE: Map<string, CacheEntry<any>> = g.__vd_cache;
const OA_CACHE: Map<string, CacheEntry<any>> = g.__oa_cache;

type DisplayRecord = {
  displayDate: string;
  odometer?: string;
  odometerNum?: number;
  type: string;
  text: string[];
};

const parseOdo = (s?: string) =>
  (s ? parseInt(s.replace(/[^0-9]/g, ""), 10) : undefined);

const sortByDateDesc = <T extends { displayDate?: string }>(recs: T[]) =>
  [...recs].sort(
    (a, b) =>
      new Date(b.displayDate || 0).getTime() -
      new Date(a.displayDate || 0).getTime()
  );

function estimateMilesPerDay(records: DisplayRecord[]): number | null {
  const withOdo = sortByDateDesc(records).filter(
    (r) => typeof r.odometerNum === "number" || r.odometer
  );
  if (withOdo.length < 2) return null;
  const a = withOdo[0],
    b = withOdo[1];
  const odoA =
    typeof a.odometerNum === "number" ? a.odometerNum : parseOdo(a.odometer);
  const odoB =
    typeof b.odometerNum === "number" ? b.odometerNum : parseOdo(b.odometer);
  if (typeof odoA !== "number" || typeof odoB !== "number") return null;
  const days =
    (new Date(a.displayDate).getTime() -
      new Date(b.displayDate || 0).getTime()) /
    (1000 * 60 * 60 * 24);
  return days > 0 ? (odoA - odoB) / days : null;
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ---------------- CARFAX ----------------
async function getCarfaxRaw(vin: string, locationId?: string) {
  const url = new URL(`${CARFAX_LOCAL_ENDPOINT}/${vin}`);
  if (locationId) url.searchParams.set("locationId", locationId);
  url.searchParams.set("raw", "1");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`CARFAX route error: ${res.status}`);
  return res.json() as Promise<any>;
}

// -------------- Vehicle Databases --------------
// Retry-aware helpers
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function retryAfterMs(res: Response, attempt: number) {
  const ra = res.headers.get("retry-after");
  const hinted = ra ? Number(ra) * 1000 : NaN;
  if (!Number.isNaN(hinted) && hinted > 0) return hinted;
  // fallback exponential backoff with jitter: 1s,2s,4s,5s,5s
  const base = Math.min(5000, 1000 * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 300);
  return base + jitter;
}

async function vdRequest(
  path: string,
  headerName: "x-AuthKey" | "Ocp-Apim-Subscription-Key"
) {
  if (!VEHICLE_DATABASES_API_KEY)
    throw new Error("VEHICLE_DATABASES_API_KEY missing");
  const url = `${VEHICLE_DATABASES_BASE}${path}`;
  let last: Response | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: "GET",
      headers: { [headerName]: VEHICLE_DATABASES_API_KEY },
    });
    last = res;

    if (res.status !== 429) return res; // success or other error => return

    const wait = retryAfterMs(res, attempt);
    console.warn(`VD 429, retry ${attempt + 1}/5 in ${wait}ms for ${url}`);
    await sleep(wait);
  }
  return last!;
}

async function fetchVDMaintenance(vin: string) {
  const path = `/vehicle-maintenance/v3/${encodeURIComponent(vin)}`;

  // 1) Preferred header: x-AuthKey
  {
    const res = await vdRequest(path, "x-AuthKey");
    if (res.ok) {
      console.log("VD auth OK via x-AuthKey @", VEHICLE_DATABASES_BASE);
      return res.json();
    }
    if (res.status !== 401) {
      const t = await res.text().catch(() => "");
      throw new Error(`VehicleDatabases error: ${res.status} ${t}`);
    }
    console.log("VD 401 via x-AuthKey — trying Ocp-Apim-Subscription-Key");
  }

  // 2) Alternate header: Ocp-Apim-Subscription-Key
  {
    const res = await vdRequest(path, "Ocp-Apim-Subscription-Key");
    if (res.ok) {
      console.log(
        "VD auth OK via Ocp-Apim-Subscription-Key @",
        VEHICLE_DATABASES_BASE
      );
      return res.json();
    }
    const t = await res.text().catch(() => "");
    throw new Error(`VehicleDatabases error: ${res.status} ${t}`);
  }
}

async function getVDMaintenanceCached(vin: string) {
  const key = vin.toUpperCase();
  const hit = VD_CACHE.get(key);
  if (hit && Date.now() - hit.at < VD_CACHE_TTL_MS) {
    return hit.data;
  }
  const data = await fetchVDMaintenance(key);
  VD_CACHE.set(key, { at: Date.now(), data });
  return data;
}

// -------------- OpenAI --------------
async function callOpenAIJSON(prompt: string) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system",
        content:
          "You are an automotive expert. Compare CARFAX service history with the OEM maintenance schedule. Classify each service item as one of: overdue, due, coming_soon, or not_yet. Output strict JSON only — no explanations, no commentary, no extra text.",
      },
      { role: "user", content: prompt },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from OpenAI");
  return JSON.parse(content);
}

async function callOpenAICached(cacheKey: string, prompt: string) {
  const hit = OA_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < OA_CACHE_TTL_MS) {
    return hit.data;
  }
  const data = await callOpenAIJSON(prompt);
  OA_CACHE.set(cacheKey, { at: Date.now(), data });
  return data;
}

// ---------------- Route ----------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> }
) {
  try {
    console.log("ANALYZE HIT:", req.url);

    // Masked secret preview
    const vdKey = VEHICLE_DATABASES_API_KEY;
    console.log("VD KEY len:", vdKey.length, "tail:", vdKey.slice(-6));
    console.log("VD BASE:", VEHICLE_DATABASES_BASE);

    const { vin } = await params; // Next.js 15 dynamic route params are async
    const cleanVin = vin?.trim();
    console.log("VIN from params:", cleanVin, "len:", cleanVin?.length);

    if (!cleanVin || cleanVin.length !== 17) {
      return NextResponse.json(
        { error: "Invalid VIN", got: cleanVin, len: cleanVin?.length },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const locationId = url.searchParams.get("locationId") || undefined;

    // 1) CARFAX
    const carfax = await getCarfaxRaw(cleanVin, locationId);
    const serviceHistory = carfax?.serviceHistory || {};
    const displayRecords: DisplayRecord[] = (serviceHistory?.displayRecords || []).map(
      (r: any) => ({
        ...r,
        odometerNum:
          typeof r.odometerNum === "number" ? r.odometerNum : parseOdo(r.odometer),
      })
    );

    const mpd = estimateMilesPerDay(displayRecords) ?? DEFAULT_MPD;

    // 2) Vehicle Databases (with 429 retry & warnings)
    let oe: any | null = null;
    const warnings: string[] = [];
    try {
      oe = await getVDMaintenanceCached(cleanVin);
    } catch (e: any) {
      warnings.push(
        `OEM schedule unavailable (Vehicle Databases error). Returned comparison is based on CARFAX only.`
      );
      console.warn("VD error:", e?.message || e);
    }

    // 3) Prompt
    const promptObj = {
      instructions: {
        current_date: todayISO(),
        miles_per_day_estimate: mpd,
        coming_soon_miles_window: COMING_SOON_MILES,
        coming_soon_days_window: COMING_SOON_DAYS,
        classify_into: ["due", "overdue", "coming_soon", "not_yet"],
      },
      carfax: {
        vin: serviceHistory?.vin ?? cleanVin,
        make: serviceHistory?.make,
        model: serviceHistory?.model,
        year: serviceHistory?.year,
        displayRecords,
      },
      oe_schedule: oe,
      notes_for_model: warnings,
    };

    const prompt =
      `Compare CARFAX history to OE schedule (if provided). Label each maintenance item as due/overdue/coming_soon/not_yet. ` +
      `If OE schedule is missing, make a best-effort based only on CARFAX. Respond only with JSON containing ` +
      `{ maintenance_comparison: { items: Array<{service, status}>, warnings?: string[], source_notes?: string[] } }.\n\n` +
      JSON.stringify(promptObj, null, 2);

    // 4) OpenAI
    const oaKey = `ana:${cleanVin}:${oe ? "oe1" : "oe0"}:${COMING_SOON_MILES}:${COMING_SOON_DAYS}:${Math.round(
      mpd
    )}`;
    let analysis: any = null;
    try {
      analysis = await callOpenAICached(oaKey, prompt);
      if (warnings.length) {
        analysis.maintenance_comparison = analysis.maintenance_comparison || {};
        analysis.maintenance_comparison.warnings = [
          ...(analysis.maintenance_comparison.warnings || []),
          ...warnings,
        ];
      }
      const notes: string[] = [];
      if (oe) notes.push("Included Vehicle Databases OE schedule (cached).");
      else notes.push("Vehicle Databases unavailable; CARFAX-only analysis.");
      analysis.maintenance_comparison.source_notes = notes;
    } catch (e: any) {
      analysis = {
        maintenance_comparison: {
          items: [],
          warnings: [
            ...warnings,
            "OpenAI analysis unavailable; returning raw vehicle details without classification.",
          ],
          source_notes: oe
            ? ["VD OE schedule retrieved (cached), but OpenAI failed."]
            : ["VD unavailable; OpenAI failed. Showing only basics."],
        },
      };
      console.warn("OpenAI error:", e?.message || e);
    }

    return NextResponse.json(
      {
        vin: serviceHistory?.vin || cleanVin,
        make: serviceHistory?.make,
        model: serviceHistory?.model,
        year: serviceHistory?.year,
        miles_per_day_used: mpd,
        analysis,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

export async function GET(req: Request, ctx: any) {
  return POST(req as any, ctx);
}
