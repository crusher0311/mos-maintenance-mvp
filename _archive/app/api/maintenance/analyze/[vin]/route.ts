// app/api/maintenance/analyze/[vin]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------- small helpers ----------
const toStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
const bool = (v?: string | null) =>
  ["1", "true", "yes", "on"].includes(String(v ?? "").toLowerCase());
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

const sortByDateDesc = <T extends { displayDate?: string }>(recs: T[]) =>
  [...recs].sort(
    (a, b) =>
      new Date(b.displayDate || 0).getTime() - new Date(a.displayDate || 0).getTime()
  );

function estimateMilesPerDay(records: DisplayRecord[]): number | null {
  const withOdo = sortByDateDesc(records).filter(
    (r) => typeof r.odometerNum === "number" || r.odometer
  );
  if (withOdo.length < 2) return null;
  const a = withOdo[0], b = withOdo[1];
  const odoA = typeof a.odometerNum === "number" ? a.odometerNum : parseOdo(a.odometer);
  const odoB = typeof b.odometerNum === "number" ? b.odometerNum : parseOdo(b.odometer);
  if (typeof odoA !== "number" || typeof odoB !== "number") return null;
  const days =
    (new Date(a.displayDate).getTime() - new Date(b.displayDate || 0).getTime()) /
    (1000 * 60 * 60 * 24);
  return days > 0 ? (odoA - odoB) / days : null;
}

function earliestDateISO(records: DisplayRecord[]): string | null {
  if (!records.length) return null;
  const sortedAsc = [...records].sort(
    (a, b) => new Date(a.displayDate || 0).getTime() - new Date(b.displayDate || 0).getTime()
  );
  const d = sortedAsc[0]?.displayDate;
  return d ? new Date(d).toISOString().slice(0, 10) : null;
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
          "You are an automotive expert. You classify ONLY the provided OEM services (not CARFAX rows). " +
          "Use CARFAX history and current odometer/months-in-service to decide each service status. " +
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

// ---------- route ----------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> }
) {
  try {
    // ✅ await dynamic params
    const { vin: rawVin } = await params;
    const vin = (rawVin || "").trim().toUpperCase();
    if (vin.length !== 17) {
      return NextResponse.json({ error: "VIN must be 17 characters" }, { status: 400 });
    }

    const url = new URL(req.url);
    const debugWanted = url.searchParams.has("debug");
    const odometer = intParam(url.searchParams.get("odometer"), 0);

    // optional inputs forwarded to OE endpoint
    const schedule = (url.searchParams.get("schedule") || "normal").toLowerCase(); // normal | severe
    const trans = toStr(url.searchParams.get("trans") ?? "");
    const fuel = toStr(url.searchParams.get("fuel") ?? "");
    const drivetrain = toStr(url.searchParams.get("drivetrain") ?? "");
    const turbo = bool(url.searchParams.get("turbo")) ? "1" : "";
    const supercharged = bool(url.searchParams.get("supercharged")) ? "1" : "";
    const cylinders = toStr(url.searchParams.get("cylinders") ?? "");
    const liters = toStr(url.searchParams.get("liters") ?? "");
    const year = toStr(url.searchParams.get("year") ?? "");
    const make = toStr(url.searchParams.get("make") ?? "");
    const model = toStr(url.searchParams.get("model") ?? "");

    const horizonMiles = intParam(url.searchParams.get("horizonMiles"), 3000);
    const horizonMonths = intParam(url.searchParams.get("horizonMonths"), 2);
    const comingSoonMilesWindow = Math.round(horizonMiles / 2);
    const comingSoonDaysWindow = Math.round((horizonMonths * 30) / 2);

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

    const mpd = estimateMilesPerDay(displayRecords) ?? 30;
    const firstDate = earliestDateISO(displayRecords);
    const monthsInService =
      firstDate ? Math.max(0, Math.round((Date.now() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24 * 30))) : null;

    // 2) OE services
    const qsCore = new URLSearchParams({
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
    }).toString();

    const oeUrl = `${url.origin}/api/oe/fetch/${vin}?${qsCore}${debugWanted ? "&explain=1" : ""}`;
    const oeRes = await getJson<any>(oeUrl);
    const oeBody = oeRes.body;
    const oeServices = Array.isArray(oeBody?.services) ? oeBody.services : [];

    const allowedServices = [...new Set(
      oeServices
        .map((s: any) => toStr(s?.name).trim())
        .filter((n) => n.length > 0)
    )];

    if (!allowedServices.length) {
      return NextResponse.json(
        {
          error: "No OEM services available for classification",
          hint:
            "Check /api/oe/fetch filters (fuel, trans, drivetrain, year/make/model) or your Mongo data mapping.",
          vin,
          forwardedFilters: { schedule, fuel, trans, drivetrain, turbo: !!turbo, supercharged: !!supercharged, cylinders, liters, year, make, model },
        },
        { status: 424 }
      );
    }

    // 3) Build strict prompt for OpenAI
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
        rules: [
          "You MUST classify only services listed in services_to_classify.",
          "Never output CARFAX lines as services.",
          "If an OE service is transmission-specific, only apply if trans matches or not specified.",
          "Every-intervals: use current_odometer and months_in_service to decide due/overdue.",
          "At-intervals: due at threshold; overdue if surpassed.",
          "coming_soon means within the horizon window (miles or months).",
        ],
      },
      services_to_classify: allowedServices,
      carfax_display_records: displayRecords,
    };

    const prompt =
      `Classify ONLY the services in services_to_classify. Return EXACT shape:\n` +
      `{\n  "maintenance_comparison": {\n    "items": Array<{ "service": string, "status": "overdue"|"due"|"coming_soon"|"not_yet" }>,\n    "warnings"?: string[],\n    "source_notes"?: string[]\n  }\n}\n\n` +
      JSON.stringify(promptObj, null, 2);

    // 4) OpenAI (defensive)
    let analysis: any;
    try {
      analysis = await callOpenAIJSON(prompt);
    } catch (e: any) {
      // Fallback: mark everything as not_yet so the endpoint still responds cleanly
      analysis = {
        maintenance_comparison: {
          items: allowedServices.map((s) => ({ service: s, status: "not_yet" })),
          warnings: [`OpenAI classification failed: ${e?.message || String(e)}`],
          source_notes: [],
        },
      };
    }

    // Normalize & enforce allowed services only
    const items: Array<{ service: string; status: string }> =
      Array.isArray(analysis?.maintenance_comparison?.items)
        ? analysis.maintenance_comparison.items
        : [];

    const allowedSet = new Set(allowedServices.map((s) => s.toLowerCase()));
    const sanitized = items
      .filter((it) => allowedSet.has(toStr(it.service).toLowerCase()))
      .map((it) => ({ service: toStr(it.service), status: toStr(it.status).toLowerCase() }));

    analysis.maintenance_comparison ||= {};
    analysis.maintenance_comparison.items = sanitized;
    analysis.maintenance_comparison.source_notes = [
      ...(analysis.maintenance_comparison.source_notes || []),
      "Included OE schedule via /api/oe/fetch with forwarded filters.",
    ];
    if (!carfaxRes.ok) {
      analysis.maintenance_comparison.warnings = [
        ...(analysis.maintenance_comparison.warnings || []),
        `CARFAX fetch failed (${carfaxRes.status}); classification relies more heavily on OEM schedule & inputs.`,
      ];
    }

    // Count statuses (normalize keys)
    const countsRaw = sanitized.reduce((acc, it) => {
      const k = String(it.status || "unknown").toUpperCase();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const counts: Record<string, number> = {
      OVERDUE: countsRaw.OVERDUE || 0,
      DUE: countsRaw.DUE || 0,
      COMING_SOON: countsRaw.COMING_SOON || 0,
      NOT_YET: countsRaw.NOT_YET || 0,
    };

    // Inputs bundle (also reused in debug)
    const inputs = {
      odometer,
      monthsInService,
      schedule,
      trans,
      fuel,
      drivetrain,
      horizonMiles,
      horizonMonths,
      milesPerDayUsed: mpd,
      comingSoonMilesWindow,
      comingSoonDaysWindow,
    };

    // Base response
    const resp: any = {
      vin,
      inputs,
      oe_summary: {
        total_services: allowedServices.length,
        names: allowedServices.slice(0, 50),
      },
      analysis,
      counts,
    };

    // ---- DEBUG INSPECTOR (optional via ?debug=1) ----
    if (debugWanted) {
      try {
        // Use a relative import to avoid alias ambiguity on Vercel/Turbopack
        const mongo = await import("../../../../../lib/mongo");
        const anyLib: any = mongo;

        // Compat: lib may export getDb() or getMongo()
        const getDbCompat = async () => {
          if (typeof anyLib.getDb === "function") return anyLib.getDb();
          if (typeof anyLib.getMongo === "function") {
            const m = await anyLib.getMongo();
            return m && typeof m.db === "function"
              ? m.db(process.env.MONGODB_DB || process.env.DB_NAME || "mos-maintenance-mvp")
              : m;
          }
          throw new Error("lib/mongo must export getDb() or getMongo()");
        };

        const db = await getDbCompat();

        const oeSnapshot = {
          source: oeBody?.source ?? undefined,
          totalBefore: oeBody?.totalBefore ?? (oeServices?.length ?? null),
          totalAfter: oeBody?.totalAfter ?? null,
          filtersApplied: oeBody?.filtersApplied ?? null,
          sampleServices: Array.isArray(oeServices) ? oeServices.slice(0, 5) : null,
          explain: Array.isArray(oeBody?.explain) ? oeBody.explain.slice(0, 10) : oeBody?.explain ?? null,
        };

        const cf = carfaxRes.body || null;
        const carfaxSnapshot = {
          ok: carfaxRes.ok,
          status: carfaxRes.status,
          hasRaw: !!cf,
          topLevelKeys: cf ? Object.keys(cf).slice(0, 15) : [],
          serviceHistoryKeys: cf?.serviceHistory ? Object.keys(cf.serviceHistory) : [],
          sampleDisplayRecords: Array.isArray(cf?.serviceHistory?.displayRecords)
            ? cf.serviceHistory.displayRecords.slice(0, 5)
            : null,
        };

        const dviCol = db.collection("inspectionfindings");
        const evtCol = db.collection("serviceevents");
        const dviDocs = await dviCol.find({ vin }).sort({ created_at: -1 }).limit(10).toArray();
        const afDocs = await evtCol
          .find({ vin, source: { $in: ["autoflow", "AF", "autoflow_webhook"] } })
          .sort({ created_at: -1 })
          .limit(10)
          .toArray();

        const autoflowSnapshot = {
          dvi_count: dviDocs.length,
          dvi_sample: dviDocs.slice(0, 5),
          events_count: afDocs.length,
          events_sample: afDocs.slice(0, 5),
        };

        const classificationInputs = {
          services_to_classify_count: allowedServices.length,
          services_to_classify_sample: allowedServices.slice(0, 10),
          carfax_records_used: displayRecords.length,
        };

        resp._debug = {
          inputs,
          source_notes: resp?.analysis?.maintenance_comparison?.source_notes ?? [],
          oe: oeSnapshot,
          carfax: carfaxSnapshot,
          autoflow: autoflowSnapshot,
          classification_inputs: classificationInputs,
        };
      } catch (e: any) {
        resp._debug_error = e?.message || String(e);
      }
    }
    // ---- /DEBUG INSPECTOR ----

    return NextResponse.json(resp, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ vin: string }> }
) {
  // Reuse POST handler (with awaited params)
  return POST(req, ctx as any);
}
