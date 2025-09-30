// app/api/maintenance/plan/[vin]/route.ts
import { NextResponse } from "next/server";
import { getAiRecommendations } from "../../../../lib/ai/recommender";
import { HistoryEvent } from "../../../../types/maintenance";

// ====== Config ======
const API_BASE = process.env.API_BASE || "http://localhost:3001"; // your Express API (DataOne-backed)
const DEFAULT_SOON_WINDOW_MILES = Number(process.env.SOON_WINDOW_MILES ?? 5000);

// ====== Types (DataOne-shaped OE via your Express API) ======
type DOInterval = {
  type: "At" | "Every";
  value: number;
  units: "Miles" | "Months" | string;
  initial?: number | null;
};

type DOService = {
  ymm_maintenance_id?: number | null;
  category?: string | null;
  name?: string | null;
  notes?: string | null;
  schedule?: { name?: string | null; description?: string | null } | null;
  intervals?: DOInterval[];
  operating_parameters?: Array<{ name?: string; notes?: string }>;
  computer_codes?: string[];
  events?: string[];
  eng_notes?: string | null;
  trans_notes?: string | null;
  trim_notes?: string | null;
};

type DOResponse = {
  vin?: string;
  decoded?: { year?: number; make?: string; model?: string };
  year?: number;
  make?: string;
  model?: string;
  services?: DOService[];
};

// ====== Helpers ======
async function getJson<T>(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
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

function parseNum(v: any): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? Number(n) : null;
}

function pickScheduleFlag(name?: string | null): "normal" | "severe" | "unknown" {
  const s = (name || "").toLowerCase();
  if (s.includes("severe")) return "severe";
  if (s.includes("normal")) return "normal";
  return "unknown";
}

type DueCalc = {
  nextMiles: number | null;
  nextMonths: number | null;
  dueNow: boolean;
  overdue: boolean;
  overdueByMiles: number | null;
  overdueByMonths: number | null;
};

function calcDueForService(
  svc: DOService,
  currentMileage: number,
  monthsInService?: number | null
): DueCalc {
  const ints = svc.intervals || [];

  // Track the earliest next trigger across all intervals
  let nextMiles: number | null = null;
  let nextMonths: number | null = null;

  // Flags and overdues
  let dueNow = false;
  let overdue = false;
  let overdueByMiles: number | null = null;
  let overdueByMonths: number | null = null;

  // Helper for "min" if not null
  const takeMin = (cur: number | null, cand: number | null) =>
    cur == null ? cand : cand == null ? cur : Math.min(cur, cand!);

  // MILES
  for (const iv of ints.filter((i) => (i.units || "").toLowerCase() === "miles")) {
    const val = parseNum(iv.value);
    if (!val || val <= 0) continue;
    const initial = parseNum(iv.initial) || 0;

    if (iv.type === "Every") {
      if (currentMileage < initial) {
        // Not started yet; first due at "initial" (or at initial + interval if initial == 0)
        const firstDue = initial > 0 ? initial : val;
        nextMiles = takeMin(nextMiles, firstDue);
        if (currentMileage === firstDue) dueNow = true;
        if (currentMileage > firstDue) {
          overdue = true;
          overdueByMiles = Math.max(0, (overdueByMiles ?? 0), currentMileage - firstDue);
        }
      } else {
        const k = Math.ceil((currentMileage - initial) / val);
        const dueAt = initial + k * val;
        nextMiles = takeMin(nextMiles, dueAt);
        if (currentMileage === dueAt) dueNow = true;
        if (currentMileage > dueAt) {
          overdue = true;
          overdueByMiles = Math.max(0, (overdueByMiles ?? 0), currentMileage - dueAt);
        }
      }
    } else if (iv.type === "At") {
      const dueAt = val;
      nextMiles = takeMin(nextMiles, dueAt);
      if (currentMileage === dueAt) dueNow = true;
      if (currentMileage > dueAt) {
        overdue = true;
        overdueByMiles = Math.max(0, (overdueByMiles ?? 0), currentMileage - dueAt);
      }
    }
  }

  // MONTHS
  if (monthsInService != null) {
    for (const iv of ints.filter((i) => (i.units || "").toLowerCase() === "months")) {
      const val = parseNum(iv.value);
      if (!val || val <= 0) continue;
      const initial = parseNum(iv.initial) || 0;
      const curM = monthsInService;

      if (iv.type === "Every") {
        if (curM < initial) {
          const firstDue = initial > 0 ? initial : val;
          nextMonths = takeMin(nextMonths, firstDue);
          if (curM === firstDue) dueNow = true;
          if (curM > firstDue) {
            overdue = true;
            overdueByMonths = Math.max(0, (overdueByMonths ?? 0) as number, curM - firstDue);
          }
        } else {
          const k = Math.ceil((curM - initial) / val);
          const dueAt = initial + k * val;
          nextMonths = takeMin(nextMonths, dueAt);
          if (curM === dueAt) dueNow = true;
          if (curM > dueAt) {
            overdue = true;
            overdueByMonths = Math.max(0, (overdueByMonths ?? 0) as number, curM - dueAt);
          }
        }
      } else if (iv.type === "At") {
        const dueAt = val;
        nextMonths = takeMin(nextMonths, dueAt);
        if (curM === dueAt) dueNow = true;
        if (curM > dueAt) {
          overdue = true;
          overdueByMonths = Math.max(0, (overdueByMonths ?? 0) as number, curM - dueAt);
        }
      }
    }
  }

  return { nextMiles, nextMonths, dueNow, overdue, overdueByMiles, overdueByMonths };
}

function statusForService(
  svc: DOService,
  due: DueCalc,
  currentMileage: number,
  soonWindowMiles: number,
  monthsInService?: number | null
):
  | "OVERDUE"
  | "DUE_NOW"
  | "COMING_SOON"
  | "FUTURE"
  | "UNKNOWN" {
  // If we have any explicit overdue signal
  if (due.overdue) return "OVERDUE";
  if (due.dueNow) return "DUE_NOW";

  const nextM = due.nextMiles;
  const nextMo = due.nextMonths;

  // Coming soon by miles
  if (nextM != null && nextM <= currentMileage + soonWindowMiles && nextM >= currentMileage) {
    return "COMING_SOON";
  }

  // Coming soon by months (if we know months)
  if (
    monthsInService != null &&
    nextMo != null &&
    nextMo >= monthsInService &&
    nextMo - monthsInService <= 2 // two months window (tune if needed)
  ) {
    return "COMING_SOON";
  }

  // Future by miles
  if (nextM != null && nextM > currentMileage + soonWindowMiles) return "FUTURE";

  // Future by months
  if (monthsInService != null && nextMo != null && nextMo > monthsInService + 2) return "FUTURE";

  return "UNKNOWN";
}

// ====== Route ======
export async function GET(
  req: Request,
  ctx: { params: Promise<{ vin: string }> } // Next.js 15: params is async
) {
  const { vin: rawVin } = await ctx.params;
  const url = new URL(req.url);

  const vin = (rawVin || "").trim().toUpperCase();
  const currentMileage = Number(url.searchParams.get("currentMileage") || 0) || 0;

  const monthsInService = url.searchParams.has("monthsInService")
    ? Number(url.searchParams.get("monthsInService"))
    : null;

  const scheduleParam = (url.searchParams.get("schedule") || "normal").toLowerCase() as
    | "normal"
    | "severe";

  const shopId = url.searchParams.get("shopId") || "";
  const withAi = ["1", "true", "yes"].includes((url.searchParams.get("ai") || "").toLowerCase());
  const debug = ["1", "true", "yes"].includes((url.searchParams.get("debug") || "").toLowerCase());

  const soonWindowMiles =
    Number(url.searchParams.get("soonWindowMiles") || DEFAULT_SOON_WINDOW_MILES) ||
    DEFAULT_SOON_WINDOW_MILES;

  if (vin.length !== 17) {
    return NextResponse.json(
      { error: "VIN must be 17 chars", received: vin, length: vin.length },
      { status: 400 }
    );
  }

  // 1) OE from your Express API (DataOne-backed)
  const oeUrl = new URL(`${API_BASE}/api/vin-maintenance`);
  oeUrl.searchParams.set("vin", vin);
  const oe = await getJson<DOResponse>(oeUrl.toString());

  const dataone = oe.body as DOResponse;
  const services: DOService[] = Array.isArray(dataone?.services) ? dataone.services! : [];

  if (!oe.ok || services.length === 0) {
    // Clean empty plan to keep UI happy
    return NextResponse.json({
      vin,
      meta: {
        currentMileage,
        monthsInService,
        schedule: scheduleParam,
        source: "dataone",
        aiEnabled: withAi,
        oeOk: oe.ok,
        oeStatus: oe.status,
        fallback: "none",
      },
      counts: {
        OVERDUE: 0,
        QUESTIONABLE_OVERDUE: 0,
        DUE_NOW: 0,
        COMING_SOON: 0,
        FUTURE: 0,
        UNKNOWN: 0,
      },
      buckets: {
        OVERDUE: [],
        QUESTIONABLE_OVERDUE: [],
        DUE_NOW: [],
        COMING_SOON: [],
        FUTURE: [],
        UNKNOWN: [],
      },
      ai: null,
      ...(debug ? { debug: { oeBody: oe.body } } : {}),
    });
  }

  // 2) Optional CARFAX history
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

  // 3) Filter services by requested schedule (normal vs severe)
  const filtered = services.filter((s) => {
    const flag = pickScheduleFlag(s.schedule?.name);
    if (flag === "unknown") {
      // If OEM didn't label it, treat as part of normal schedule by default
      return scheduleParam === "normal";
    }
    return flag === scheduleParam;
  });

  // 4) Classify services into buckets
  type BucketKey =
    | "OVERDUE"
    | "QUESTIONABLE_OVERDUE"
    | "DUE_NOW"
    | "COMING_SOON"
    | "FUTURE"
    | "UNKNOWN";

  const buckets: Record<BucketKey, any[]> = {
    OVERDUE: [],
    QUESTIONABLE_OVERDUE: [],
    DUE_NOW: [],
    COMING_SOON: [],
    FUTURE: [],
    UNKNOWN: [],
  };

  for (const s of filtered) {
    const due = calcDueForService(s, currentMileage, monthsInService);
    const status = statusForService(s, due, currentMileage, soonWindowMiles, monthsInService ?? undefined);

    // naive history assist: if it's overdue but we can see a very recent matching description,
    // soften to QUESTIONABLE_OVERDUE (best-effort; can refine later)
    let finalStatus: BucketKey = status;
    if (status === "OVERDUE" && history.length) {
      const label = (s.name || "").toLowerCase();
      const recent = history.slice(0, 10).some((h) =>
        String(h.description || "").toLowerCase().includes(label.split(" ")[0] || "")
      );
      if (recent) finalStatus = "QUESTIONABLE_OVERDUE";
    }

    const item = {
      category: s.category || "General",
      name: s.name || "Service",
      schedule: s.schedule?.name || (scheduleParam === "severe" ? "Severe Maintenance Schedule" : "Normal Maintenance Schedule"),
      trans_notes: s.trans_notes || null,
      next: { miles: due.nextMiles, months: due.nextMonths },
      overdueBy: { miles: due.overdueByMiles, months: due.overdueByMonths },
      intervals: s.intervals || [],
      notes: s.notes || null,
      source: "dataone",
    };

    buckets[finalStatus].push(item);
  }

  // 5) Counts
  const counts = Object.fromEntries(
    Object.entries(buckets).map(([k, v]) => [k, v.length])
  );

  // 6) AI (optional)
  const ai = withAi ? await getAiRecommendations(vin, currentMileage, buckets) : null;

  return NextResponse.json({
    vin,
    meta: {
      currentMileage,
      monthsInService,
      schedule: scheduleParam,
      source: "dataone",
      aiEnabled: withAi,
      oeOk: oe.ok,
      oeStatus: oe.status,
      fallback: "none",
    },
    counts,
    buckets,
    ai,
    ...(debug ? { debug: { oeBody: oe.body } } : {}),
  });
}
