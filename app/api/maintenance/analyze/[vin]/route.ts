// app/api/maintenance/analyze/[vin]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // avoid caching in dev/prod

// ---------- helpers ----------
const intParam = (v: string | null, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

const parseOdo = (s?: string) =>
  (s ? parseInt(s.replace(/[^0-9]/g, ""), 10) : undefined);

type DisplayRecord = {
  displayDate: string;
  odometer?: string;
  odometerNum?: number;
  type: string;
  text: string[];
};

type OeService = {
  category: string;
  name: string;
  schedule?: { name: string } | null;
  intervals: Array<{ miles?: number; months?: number; type: "every" | "at" }>;
  trans_notes?: string | null;
};

const sortByDateAsc = <T extends { displayDate?: string }>(recs: T[]) =>
  [...recs].sort(
    (a, b) =>
      new Date(a.displayDate || 0).getTime() -
      new Date(b.displayDate || 0).getTime()
  );

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
  const a = withOdo[0], b = withOdo[1];
  const odoA =
    typeof a.odometerNum === "number" ? a.odometerNum : parseOdo(a.odometer);
  const odoB =
    typeof b.odometerNum === "number" ? b.odometerNum : parseOdo(b.odometer);
  if (typeof odoA !== "number" || typeof odoB !== "number") return null;
  const days =
    (new Date(a.displayDate).getTime() - new Date(b.displayDate || 0).getTime()) /
    (1000 * 60 * 60 * 24);
  return days > 0 ? (odoA - odoB) / days : null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

async function getJson<T = any>(url: string): Promise<{ ok: boolean; status: number; body: T | any; }> {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { ok: res.ok, status: res.status, body: parsed };
}

// ---------- OpenAI ----------
async function callOpenAIJSON(prompt: string) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system",
        content:
          "You are an automotive expert. Compare CARFAX service history with the OEM maintenance schedule. " +
          "Use the provided current odometer and months-in-service to determine due/overdue/coming_soon/not_yet. " +
          "Output strict JSON only—no explanations."
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

// ---------- VIN extraction (path-derived only) ----------
function extractVin(req: NextRequest): string {
  const url = new URL(req.url);
  const pathname = url.pathname; // /api/maintenance/analyze/<VIN>
  const parts = pathname.split("/").filter(Boolean);
  const vinFromPath = decodeURIComponent(parts[parts.length - 1] || "");
  return (vinFromPath || "").trim().toUpperCase();
}

// ---------- transmission helpers ----------
function isAutoOnly(s: OeService): boolean {
  const n = (s.name || "").toLowerCase();
  const tn = (s.trans_notes || "").toLowerCase();
  return /\bautomatic\b/.test(n) || /\bautomatic\b/.test(tn);
}

function isManualOnly(s: OeService): boolean {
  const n = (s.name || "").toLowerCase();
  const tn = (s.trans_notes || "").toLowerCase();
  return /\bmanual\b/.test(n) || /\bmanual\b/.test(tn);
}

function filterByTransmission(services: OeService[], trans: "" | "manual" | "automatic") {
  if (trans === "automatic") {
    return { filtered: services.filter(s => !isManualOnly(s)), hadSpecific: services.some(s => isAutoOnly(s) || isManualOnly(s)) };
  }
  if (trans === "manual") {
    return { filtered: services.filter(s => !isAutoOnly(s)), hadSpecific: services.some(s => isAutoOnly(s) || isManualOnly(s)) };
  }
  // Unknown transmission: keep all, but note that some were transmission-specific
  return { filtered: services, hadSpecific: services.some(s => isAutoOnly(s) || isManualOnly(s)) };
}

// ---------- shared handler ----------
async function handleAnalyze(req: NextRequest) {
  try {
    // VIN
    const vin = extractVin(req);
    if (vin.length !== 17) {
      return NextResponse.json({ error: "VIN must be 17 characters" }, { status: 400 });
    }
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return NextResponse.json({ error: "VIN format invalid" }, { status: 400 });
    }

    const url = new URL(req.url);
    const odometer = intParam(url.searchParams.get("odometer"), 0);
    const monthsInServiceQuery = url.searchParams.has("monthsInService")
      ? intParam(url.searchParams.get("monthsInService"), 0)
      : null;
    const scheduleRaw = (url.searchParams.get("schedule") || "normal").toLowerCase();
    const schedule: "normal" | "severe" = scheduleRaw === "severe" ? "severe" : "normal";
    const transRaw = (url.searchParams.get("trans") || "").toLowerCase();
    const trans: "" | "manual" | "automatic" =
      transRaw === "manual" ? "manual" :
      transRaw === "automatic" ? "automatic" : "";
    const horizonMiles = intParam(url.searchParams.get("horizonMiles"), 1000);
    const horizonMonths = intParam(url.searchParams.get("horizonMonths"), 1);

    // 1) CARFAX (local route, raw)
    const carfaxUrl = `${url.origin}/api/carfax/fetch/${vin}?raw=1`;
    const carfaxRes = await postJson<any>(carfaxUrl, {});
    const serviceHistory = carfaxRes.body?.serviceHistory || {};
    const displayRecords: DisplayRecord[] = Array.isArray(serviceHistory?.displayRecords)
      ? serviceHistory.displayRecords.map((r: any) => ({
          ...r,
          odometerNum:
            typeof r.odometerNum === "number" ? r.odometerNum : parseOdo(r.odometer),
        }))
      : [];

    // 2) Estimate months-in-service if not provided:
    let monthsInService = monthsInServiceQuery;
    let monthsInServiceNote: string | null = null;
    if (monthsInService == null) {
      const dates = sortByDateAsc(displayRecords)
        .map(r => new Date(r.displayDate))
        .filter(d => !isNaN(d.getTime()));
      if (dates.length) {
        const first = dates[0].getTime();
        const now = Date.now();
        const months = Math.floor((now - first) / (1000 * 60 * 60 * 24 * 30.44));
        monthsInService = Math.max(0, months);
        monthsInServiceNote = `Estimated months_in_service=${monthsInService} from earliest CARFAX record ${new Date(dates[0]).toISOString().slice(0,10)}.`;
      }
    }

    const mpd = estimateMilesPerDay(displayRecords) ?? 30;

    // 3) OE services via Next proxy (mock or real)
    const oeUrl = `${url.origin}/api/oe/fetch/${vin}?schedule=${encodeURIComponent(schedule)}`;
    const oeRes = await getJson<any>(oeUrl);
    const oeBody = oeRes.body;
    const oeServicesAll: OeService[] = Array.isArray(oeBody?.services) ? oeBody.services : [];

    // 3a) Filter services by transmission
    const { filtered: oeServices, hadSpecific } = filterByTransmission(oeServicesAll, trans);

    // 3b) Adjust "coming soon" windows for severe schedule (tighter)
    const SEVERE_SCALE = 0.75;
    const comingSoonMilesWindow = schedule === "severe" ? Math.max(500, Math.round(1500 * SEVERE_SCALE)) : 1500;
    const comingSoonDaysWindow  = schedule === "severe" ? Math.max(15,  Math.round(60   * SEVERE_SCALE)) : 60;

    // 4) Build prompt for OpenAI
    const promptObj = {
      instructions: {
        current_date: todayISO(),
        current_odometer_miles: odometer,
        months_in_service: monthsInService,
        miles_per_day_estimate: mpd,
        schedule_mode: schedule,
        transmission: trans || null,
        horizon_miles: horizonMiles,
        horizon_months: horizonMonths,
        coming_soon_miles_window: comingSoonMilesWindow,
        coming_soon_days_window: comingSoonDaysWindow,
        classify_into: ["overdue", "due", "coming_soon", "not_yet"],
      },
      carfax_display_records: displayRecords,
      oe_schedule: {
        vin: oeBody?.vin ?? vin,
        year: oeBody?.year ?? null,
        make: oeBody?.make ?? null,
        model: oeBody?.model ?? null,
        services: oeServices.map((s: OeService) => ({
          category: s.category,
          name: s.name,
          schedule: s?.schedule?.name ?? null,
          intervals: s.intervals,
          trans_notes: s.trans_notes ?? null,
        })),
      },
    };

    const prompt =
      `Compare CARFAX records to the provided OEM schedule and classify each service item. ` +
      `Return ONLY JSON with shape: { maintenance_comparison: { items: Array<{service, status}>, warnings?: string[], source_notes?: string[] } }.\n\n` +
      JSON.stringify(promptObj, null, 2);

    // 5) OpenAI
    let analysis = await callOpenAIJSON(prompt);

    // 6) Attach source notes/warnings
    analysis.maintenance_comparison ||= {};
    analysis.maintenance_comparison.source_notes = [
      ...(analysis.maintenance_comparison.source_notes || []),
      "Included DataOne OE schedule (cached) via Express API.",
    ];
    if (schedule === "severe") {
      analysis.maintenance_comparison.source_notes.push(
        `Severe schedule applied: coming-soon windows tightened to ${comingSoonMilesWindow} miles / ${comingSoonDaysWindow} days.`
      );
    }
    if (monthsInServiceNote) {
      analysis.maintenance_comparison.source_notes.push(monthsInServiceNote);
    }
    if (!carfaxRes.ok) {
      analysis.maintenance_comparison.warnings = [
        ...(analysis.maintenance_comparison.warnings || []),
        `CARFAX fetch failed (${carfaxRes.status}); classification relies more heavily on OEM schedule & inputs.`,
      ];
    }
    if (!trans && hadSpecific) {
      analysis.maintenance_comparison.warnings = [
        ...(analysis.maintenance_comparison.warnings || []),
        "Some services are transmission-specific. Set ?trans=automatic or ?trans=manual for more precise results.",
      ];
    }

    // 7) Count statuses for convenience
    const items: Array<{ service: string; status: string }> =
      analysis?.maintenance_comparison?.items ?? [];
    const counts = items.reduce((acc, it) => {
      const k = String(it.status || "unknown").toUpperCase();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json(
      {
        vin,
        inputs: {
          odometer,
          monthsInService,
          schedule,
          trans,
          horizonMiles,
          horizonMonths,
          milesPerDayUsed: mpd,
          comingSoonMilesWindow,
          comingSoonDaysWindow,
        },
        analysis,
        counts
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

// ---------- route wrappers (no params usage) ----------
export async function GET(req: NextRequest) {
  return handleAnalyze(req);
}
export async function POST(req: NextRequest) {
  return handleAnalyze(req);
}
