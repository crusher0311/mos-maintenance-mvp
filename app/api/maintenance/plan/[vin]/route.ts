// app/api/maintenance/plan/[vin]/route.ts
import { NextResponse } from "next/server";
import { normalizeVdb } from "../../../../lib/providers/vdb";
import { buildPlan } from "../../../../lib/logic/plan";
import { VdbResponse, HistoryEvent } from "../../../../types/maintenance";
import { getAiRecommendations } from "../../../../lib/ai/recommender";
import { extendVdbMaintenance } from "../../../../lib/logic/extend-oe";
import { loadIntervalOverrides } from "../../../../lib/config/shop-intervals";
import { loadVinFixture } from "../../../../lib/dev/load-fixture";

// ---------- helpers ----------
async function getJson<T>(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body: body as T };
}

function mapHistory(raw: any): HistoryEvent[] {
  try {
    const arr = Array.isArray(raw?.events)
      ? raw.events
      : Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data?.events)
      ? raw.data.events
      : [];
    return arr.map((e: any) => ({
      date: e.date ?? e.eventDate ?? "",
      mileage: e.odometer ?? e.mileage ?? null,
      description: e.description ?? e.service ?? e.title ?? "",
      source: "carfax",
    }));
  } catch {
    return [];
  }
}

// ---------- route ----------
export async function GET(
  req: Request,
  ctx: { params: Promise<{ vin: string }> } // Next.js 15: params is async
) {
  const { vin: rawVin } = await ctx.params;
  const url = new URL(req.url);

  const vin = (rawVin || "").trim().toUpperCase();
  const currentMileage = Number(url.searchParams.get("currentMileage") || 0) || 0;
  const shopId = url.searchParams.get("shopId") || "";
  const withAi = ["1", "true", "yes"].includes((url.searchParams.get("ai") || "").toLowerCase());
  const debug = ["1", "true", "yes"].includes((url.searchParams.get("debug") || "").toLowerCase());

  const horizon = Math.max(
    currentMileage,
    Number(url.searchParams.get("horizonMileage") || currentMileage + 15000) || (currentMileage + 15000)
  );

  if (vin.length !== 17) {
    return NextResponse.json(
      { error: "VIN must be 17 chars", received: vin, length: vin.length },
      { status: 400 }
    );
  }

  // 1) OE via local VDB route (VIN)
  const oe = await getJson<any>(`${url.origin}/api/oe/fetch/${vin}`);

  // Be forgiving about raw shapes from the upstream
  const raw = (oe.body as any)?.raw ?? (oe.body as any);
  let vdbPayload: VdbResponse | undefined =
    (raw?.data ?? raw?.Data ?? raw) as VdbResponse;

  // 1a) If missing or empty, try local fixture: app/dev-fixtures/oe/<VIN>.json
  if (!vdbPayload || !Array.isArray((vdbPayload as any).maintenance) || !(vdbPayload as any).maintenance.length) {
    const fixture = loadVinFixture(vin);
    if (fixture && Array.isArray(fixture.maintenance) && fixture.maintenance.length) {
      vdbPayload = fixture as VdbResponse;
    } else {
      // still nothing: respond cleanly with an empty plan – keeps UI & AI happy
      return NextResponse.json({
        vin,
        meta: {
          currentMileage,
          source: (oe.body as any)?.source ?? "vdb",
          aiEnabled: withAi,
          oeOk: oe.ok,
          oeStatus: oe.status,
          fallback: "none",
        },
        counts: { OVERDUE: 0, QUESTIONABLE_OVERDUE: 0, DUE_NOW: 0, COMING_SOON: 0, FUTURE: 0, UNKNOWN: 0 },
        buckets: { OVERDUE: [], QUESTIONABLE_OVERDUE: [], DUE_NOW: [], COMING_SOON: [], FUTURE: [], UNKNOWN: [] },
        ai: null,
        ...(debug ? { debug: { oeBody: oe.body } } : {}),
      });
    }
  }

  // --- Extend OE schedule beyond OEM cap (up to 3×) ---
  const overrides = loadIntervalOverrides();
  const extendedVdb = extendVdbMaintenance(vdbPayload!, {
    multiplier: 3,      // extend out to ~3× OEM ceiling
    factor: 0.5,        // post-cap interval = original * 0.5 (except exemptions)
    exemptions: [
      "Replace Engine Oil & Filter",
      "Rotate Tires",
    ],
    overrides,
  });

  // 2) Carfax history (optional)
  const carfaxUrl = shopId
    ? `${url.origin}/api/carfax/fetch/${vin}?shopId=${encodeURIComponent(shopId)}`
    : `${url.origin}/api/carfax/fetch/${vin}`;

  let history: HistoryEvent[] = [];
  try {
    const histRes = await getJson<any>(carfaxUrl);
    history = mapHistory(histRes.body);
  } catch {
    history = [];
  }

  // 3) Normalize -> tasks (using extended schedule)
  const tasks = normalizeVdb(extendedVdb);

  // 4) Build plan
  const plan = buildPlan(tasks, history, currentMileage, {
    horizonMileage: horizon,
    soonWindowMiles: 5000,
    questionableIfNoHistory: true,
  });

  // 5) Bucketize
  const buckets = {
    OVERDUE: plan.filter((p) => p.status === "OVERDUE"),
    QUESTIONABLE_OVERDUE: plan.filter((p) => p.status === "QUESTIONABLE_OVERDUE"),
    DUE_NOW: plan.filter((p) => p.status === "DUE_NOW"),
    COMING_SOON: plan.filter((p) => p.status === "COMING_SOON"),
    FUTURE: plan.filter((p) => p.status === "FUTURE"),
    UNKNOWN: plan.filter((p) => p.status === "UNKNOWN"),
  };

  // 6) AI (optional)
  const ai = withAi ? await getAiRecommendations(vin, currentMileage, buckets) : null;

  return NextResponse.json({
    vin,
    meta: {
      currentMileage,
      source: (oe.body as any)?.source ?? "vdb",
      aiEnabled: withAi,
      oeOk: oe.ok,
      oeStatus: oe.status,
      fallback: "fixture_if_needed",
    },
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    buckets,
    ai,
    ...(debug ? { debug: { oeBody: oe.body } } : {}),
  });
}
