import { getMongo } from "@/lib/mongo";

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

/* ---------------- Analyze → counts normalizer (fallback) ---------------- */
function bucketsFromAnalyze(raw: any) {
  const root = raw?.analysis?.maintenance_comparison ?? raw?.analysis ?? raw;

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

/* ---------------- Route ---------------- */
export async function GET() {
  const client = await getMongo();
  const db = client.db();

  // Latest analysis doc per VIN, joined with vehicles for a proper title
  const latest = await db
    .collection("analyses")
    .aggregate([
      { $sort: { vin: 1, createdAt: -1 } },
      {
        $group: {
          _id: "$vin",
          vin: { $first: "$vin" },
          counts: { $first: "$counts" },
          raw: { $first: "$raw" },
          createdAt: { $first: "$createdAt" },
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vin",
          foreignField: "vin",
          as: "veh",
        },
      },
      { $unwind: { path: "$veh", preserveNullAndEmptyArrays: true } },
      { $sort: { vin: 1 } },
    ])
    .toArray();

  const rows: Row[] = latest.map((r: any) => {
    const counts: Counts =
      r?.counts && typeof r.counts === "object"
        ? {
            overdue: r.counts.overdue ?? 0,
            comingSoon: r.counts.comingSoon ?? 0,
            notYet: r.counts.notYet ?? 0,
          }
        : countsFromAnalyze(r?.raw);

    const titleParts = [r?.veh?.year, r?.veh?.make, r?.veh?.model, r?.veh?.trim]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      vin: r.vin,
      vehicleTitle: titleParts || r.vin,
      shop: null,
      counts,
      updated: r?.createdAt ? new Date(r.createdAt).toISOString() : null,
    };
  });

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
      rowCount: rows.length,
    },
  };

  return Response.json(payload, { status: 200 });
}
