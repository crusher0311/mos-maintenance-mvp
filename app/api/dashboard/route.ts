import { NextRequest } from "next/server";

/* ---------------- Types ---------------- */
type Counts = { overdue: number; comingSoon: number; notYet: number };

type Row = {
  vin: string;
  vehicleTitle: string;
  shop?: string | null;
  counts: Counts;
  updated?: string | null;
};

type DashboardPayload = {
  rows: Row[];
  totals: Counts;
  __debug?: Record<string, any>;
};

/* ---------------- Analyze → counts normalizer ---------------- */
function bucketsFromAnalyze(raw: any) {
  const root =
    raw?.analysis?.maintenance_comparison ??
    raw?.analysis ??
    raw;

  const buckets = { overdue: [] as any[], soon: [] as any[], notYet: [] as any[] };
  if (!root || typeof root !== "object") return buckets;

  const pushAll = (arr: any[], key: "overdue" | "soon" | "notYet") => {
    if (!Array.isArray(arr)) return;
    for (const it of arr) buckets[key].push(it);
  };

  // 1) services list with statuses
  const services = root.services ?? root.items ?? root.list;
  if (Array.isArray(services)) {
    for (const it of services) {
      const s = String(
        it?.status ?? it?.recommendation_status ?? it?.category ?? "not_yet"
      ).toLowerCase();
      if (s.includes("overdue") || s.includes("past")) buckets.overdue.push(it);
      else if (s.includes("soon")) buckets.soon.push(it);
      else buckets.notYet.push(it);
    }
  }

  // 2) groups container
  if (root.groups) {
    pushAll(root.groups.overdue ?? root.groups.past_due, "overdue");
    pushAll(root.groups.coming_soon ?? root.groups.dueSoon ?? root.groups.due_soon, "soon");
    pushAll(root.groups.not_yet ?? root.groups.notYet, "notYet");
  }

  // 3) arrays on root (various names)
  for (const k of Object.keys(root)) {
    const v = (root as any)[k];
    if (!Array.isArray(v)) continue;
    const key = k.toLowerCase();
    if (key.includes("overdue") || key.includes("past")) pushAll(v, "overdue");
    else if (key.includes("coming") || key.includes("due_soon") || key.includes("soon")) pushAll(v, "soon");
    else if (key.includes("not_yet") || key.includes("notyet") || key.includes("future")) pushAll(v, "notYet");
  }

  // 4) details (string lists)
  if (root.details) {
    pushAll(root.details.overdue ?? root.details.past_due, "overdue");
    pushAll(root.details.coming_soon ?? root.details.due_soon, "soon");
    pushAll(root.details.not_yet ?? root.details.future, "notYet");
  }

  return buckets;
}

function countsFromAnalyze(raw: any): Counts {
  const b = bucketsFromAnalyze(raw);
  return {
    overdue: b.overdue.length,
    comingSoon: b.soon.length,
    notYet: b.notYet.length,
  };
}

function vehicleTitleFrom(raw: any, vin: string) {
  const t =
    raw?.vehicleTitle ||
    `${raw?.year ?? ""} ${raw?.make ?? ""} ${raw?.model ?? ""} ${raw?.trim ?? ""}`;
  const cleaned = String(t).replace(/\s+/g, " ").trim();
  return cleaned || vin;
}

/* ---------------- Route ---------------- */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin; // call our own server

  // VIN list: set in .env.local as NEXT_PUBLIC_DASHBOARD_VINS="VIN1,VIN2,..."
  const vinsEnv =
    process.env.NEXT_PUBLIC_DASHBOARD_VINS || process.env.DASHBOARD_VINS || "";

  const vins = vinsEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Fallback demo list (remove if you always set env)
  if (vins.length === 0) {
    vins.push("3FAHP0HG1BR342453", "JTDKB20U253109552");
  }

  const rows: Row[] = [];

  for (const vin of vins) {
    try {
      const res = await fetch(
        `${origin}/api/maintenance/analyze/${encodeURIComponent(vin)}?r=${Date.now()}`,
        { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" } }
      );
      if (!res.ok) throw new Error(`analyze ${vin} → HTTP ${res.status}`);
      const raw = await res.json();

      rows.push({
        vin,
        vehicleTitle: vehicleTitleFrom(raw, vin),
        shop: null,
        counts: countsFromAnalyze(raw),
        updated: new Date().toISOString(),
      });
    } catch (e) {
      // keep row so you can still click through
      rows.push({
        vin,
        vehicleTitle: vin,
        shop: null,
        counts: { overdue: 0, comingSoon: 0, notYet: 0 },
        updated: null,
      });
    }
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.overdue += r.counts.overdue;
      acc.comingSoon += r.counts.comingSoon;
      acc.notYet += r.counts.notYet;
      return acc;
    },
    { overdue: 0, comingSoon: 0, notYet: 0 } as Counts
  );

  const payload: DashboardPayload = {
    rows,
    totals,
    __debug: {
      vins,
      originUsed: origin,
      rowCount: rows.length,
    },
  };

  return Response.json(payload, { status: 200 });
}
