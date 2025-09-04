import { getMongo } from "@/lib/mongo";

/* Types */
type Counts = { overdue: number; comingSoon: number; notYet: number };
type Row = { vin: string; vehicleTitle: string; shop?: string | null; counts: Counts; updated?: string | null };
type DashboardPayload = { rows: Row[]; totals: Counts; __debug?: Record<string, any> };

/* Fallback normalizer (if counts not stored) */
function bucketsFromAnalyze(raw: any) {
  const root = raw?.analysis?.maintenance_comparison ?? raw?.analysis ?? raw;
  const buckets = { overdue: [] as any[], soon: [] as any[], notYet: [] as any[] };
  if (!root || typeof root !== "object") return buckets;
  const pushAll = (arr: any[], key: "overdue" | "soon" | "notYet") => { if (Array.isArray(arr)) for (const it of arr) buckets[key].push(it); };
  const services = root.services ?? root.items ?? root.list;
  if (Array.isArray(services)) {
    for (const it of services) {
      const s = String(it?.status ?? it?.recommendation_status ?? it?.category ?? "not_yet").toLowerCase();
      if (s.includes("overdue") || s.includes("past")) buckets.overdue.push(it);
      else if (s.includes("soon")) buckets.soon.push(it);
      else buckets.notYet.push(it);
    }
  }
  if (root.groups) {
    pushAll(root.groups.overdue ?? root.groups.past_due, "overdue");
    pushAll(root.groups.coming_soon ?? root.groups.dueSoon ?? root.groups.due_soon, "soon");
    pushAll(root.groups.not_yet ?? root.groups.notYet, "notYet");
  }
  for (const k of Object.keys(root)) {
    const v = (root as any)[k]; if (!Array.isArray(v)) continue;
    const key = k.toLowerCase();
    if (key.includes("overdue") || key.includes("past")) pushAll(v, "overdue");
    else if (key.includes("coming") || key.includes("due_soon") || key.includes("soon")) pushAll(v, "soon");
    else if (key.includes("not_yet") || key.includes("notyet") || key.includes("future")) pushAll(v, "notYet");
  }
  if (root.details) {
    pushAll(root.details.overdue ?? root.details.past_due, "overdue");
    pushAll(root.details.coming_soon ?? root.details.due_soon, "soon");
    pushAll(root.details.not_yet ?? root.details.future, "notYet");
  }
  return buckets;
}
function countsFromAnalyze(raw: any): Counts {
  const b = bucketsFromAnalyze(raw);
  return { overdue: b.overdue.length, comingSoon: b.soon.length, notYet: b.notYet.length };
}

export async function GET(req: Request) {
  const client = await getMongo();
  const db = client.db();
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId") || undefined;

  // Active VINs from AutoFlow mirror
  const liveMatch: any = shopId ? { shopId } : {};
  const activeVins: string[] = await db.collection("af_open").distinct("vin", liveMatch);
  if (activeVins.length === 0) {
    const empty: DashboardPayload = { rows: [], totals: { overdue: 0, comingSoon: 0, notYet: 0 }, __debug: { activeVins: 0, shopId: shopId ?? null } };
    return Response.json(empty);
  }

  // Latest analysis per active VIN + join vehicles
  const latest = await db.collection("analyses")
    .aggregate([
      { $match: { vin: { $in: activeVins } } },
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
        ? { overdue: r.counts.overdue ?? 0, comingSoon: r.counts.comingSoon ?? 0, notYet: r.counts.notYet ?? 0 }
        : countsFromAnalyze(r?.raw);

    const title = [r?.veh?.year, r?.veh?.make, r?.veh?.model, r?.veh?.trim].filter(Boolean).join(" ").trim();

    return {
      vin: r.vin,
      vehicleTitle: title || r.vin,
      shop: null,
      counts,
      updated: r?.createdAt ? new Date(r.createdAt).toISOString() : null,
    };
  });

  const totals = rows.reduce(
    (a, r) => ({ overdue: a.overdue + r.counts.overdue, comingSoon: a.comingSoon + r.counts.comingSoon, notYet: a.notYet + r.counts.notYet }),
    { overdue: 0, comingSoon: 0, notYet: 0 }
  );

  const payload: DashboardPayload = {
    rows,
    totals,
    __debug: { rowCount: rows.length, activeVins: activeVins.length, shopId: shopId ?? null },
  };

  return Response.json(payload, { status: 200 });
}

