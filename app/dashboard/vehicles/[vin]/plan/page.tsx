import Link from "next/link";
import { getDb } from "@/lib/mongo";
import { requireSession } from "@/lib/auth";
import { 
  resolveAutoflowConfig, 
  fetchDviWithCache 
} from "@/lib/integrations/autoflow";
import { 
  resolveCarfaxConfig, 
  fetchCarfaxWithCache 
} from "@/lib/integrations/carfax";
import PlanUI from "./PlanUI-modern";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- small utils ---------------- */
function fmtMiles(m?: number | null) {
  if (m === 0) return "0";
  if (m == null) return "";
  return m.toLocaleString();
}
function daysBetween(a: Date, b: Date) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}
function addMonths(d: Date, months: number) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + months);
  return dt;
}
function parseCarfaxDate(d?: string | null): Date | null {
  if (!d) return null;
  const trimmed = String(d).trim();
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = Number(m[1]), dd = Number(m[2]), yy = Number(m[3]);
    const dt = new Date(yy, mm - 1, dd);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}
function toSquish(vin: string) {
  const v = String(vin).toUpperCase().trim();
  return v.slice(0, 8) + v.slice(9, 11);
}

/* ---------------- Local OEM schedule (Mongo) ---------------- */
async function getLocalOeFromMongo(vin: string) {
  const db = await getDb();
  const SQUISH = toSquish(vin);

  const pipeline = [
    { $match: { squish: SQUISH } },
    { $project: { _id: 0, squish: 1, vin_maintenance_id: 1, maintenance_id: 1 } },
    { $limit: 200 },
    {
      $lookup: {
        from: "dataone_lkp_maintenance_interval",
        localField: "maintenance_id",
        foreignField: "maintenance_id",
        as: "intervals",
      },
    },
    { $unwind: "$intervals" },
    {
      $lookup: {
        from: "dataone_lkp_maintenance",
        localField: "maintenance_id", 
        foreignField: "maintenance_id",
        as: "maintenance",
      },
    },
    { $unwind: "$maintenance" },
    {
      $group: {
        _id: { maintenance_id: "$maintenance_id" },
        maintenance_name: { $first: "$maintenance.maintenance_name" },
        maintenance_category: { $first: "$maintenance.maintenance_category" },
        maintenance_notes: { $first: "$maintenance.maintenance_notes" },
        intervals: {
          $push: {
            interval_id: "$intervals.interval_id",
            type: "$intervals.interval_type",
            value: "$intervals.value",
            units: "$intervals.units",
            initial_value: "$intervals.initial_value",
          },
        },
      },
    },
    {
      $addFields: {
        miles: {
          $let: {
            vars: { m: { $filter: { input: "$intervals", as: "i", cond: { $eq: ["$$i.units", "Miles"] } } } },
            in: {
              $cond: [
                { $gt: [{ $size: "$$m" }, 0] },
                { $arrayElemAt: [{ $map: { input: "$$m", as: "x", in: "$$x.value" } }, 0] },
                null,
              ],
            },
          },
        },
        months: {
          $let: {
            vars: { m: { $filter: { input: "$intervals", as: "i", cond: { $eq: ["$$i.units", "Months"] } } } },
            in: {
              $cond: [
                { $gt: [{ $size: "$$m" }, 0] },
                { $arrayElemAt: [{ $map: { input: "$$m", as: "x", in: "$$x.value" } }, 0] },
                null,
              ],
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        maintenance_id: "$_id.maintenance_id",
        name: "$maintenance_name",
        category: "$maintenance_category",
        notes: "$maintenance_notes",
        miles: 1,
        months: 1,
        intervals: 1,
      },
    },
    { $sort: { category: 1, name: 1 } },
    { $limit: 200 },
  ];

  const items = await db
    .collection("dataone_lkp_vin_maintenance")
    .aggregate(pipeline, { allowDiskUse: true, hint: "squish_1" })
    .toArray();

  return { ok: true as const, vin, squish: SQUISH, count: items.length, items };
}

/* ---------------- Normalization / rules engine ---------------- */
type OEMItem = {
  maintenance_id: number;
  name: string;
  category: string;
  notes?: string | null;
  miles?: number | null;
  months?: number | null;
};
type LastDone = { miles?: number | null; date?: Date | null };

const SERVICE_KEYS: Record<string, string[]> = {
  oil: ["oil and filter", "engine oil", "oil change", "replace engine oil and filter"],
  tire_rotation: ["rotate tires", "tire rotation", "rotate tyre"],
  brake_fluid: ["brake fluid", "brake flush"],
  coolant: ["engine coolant", "coolant flush", "replace coolant"],
  trans_fluid: ["automatic transmission fluid", "transmission fluid", "transmission flush"],
  engine_air: ["engine air filter", "air filter"],
  cabin_air: ["cabin air filter", "pollen filter"],
  spark_plugs: ["spark plugs"],
  inspect_brakes: ["inspect brake pads", "inspect brake", "inspect brake hoses", "parking brake"],
  multi_point: ["multi-point inspection", "multi point inspection"],
};

function toKeyFromName(name: string): string | null {
  const n = name.toLowerCase();
  for (const [key, vals] of Object.entries(SERVICE_KEYS)) {
    if (vals.some((v) => n.includes(v))) return key;
  }
  if (n.includes("exhaust system")) return "exhaust";
  if (n.includes("steering") || n.includes("suspension")) return "steer_susp";
  if (n.includes("automatic transmission fluid")) return "trans_fluid";
  return null;
}

function toKeyFromFreeText(desc: string): string[] {
  const d = desc.toLowerCase();
  const hits: string[] = [];
  for (const [key, vals] of Object.entries(SERVICE_KEYS)) {
    if (vals.some((v) => d.includes(v))) hits.push(key);
  }
  if (d.includes("oil") && !hits.includes("oil")) hits.push("oil");
  if (d.includes("rotate") && d.includes("tire") && !hits.includes("tire_rotation")) hits.push("tire_rotation");
  return Array.from(new Set(hits));
}

type TriagedItem = {
  key: string;
  title: string;
  category?: string;
  intervalMiles?: number | null;
  intervalMonths?: number | null;
  last?: LastDone;
  dueAtMiles?: number | null;
  dueAtDate?: Date | null;
  milesToGo?: number | null;
  daysToGo?: number | null;
  bump?: "red" | "yellow" | null;
};

type Buckets = { overdue: TriagedItem[]; dueSoon: TriagedItem[]; upcoming: TriagedItem[] };

function triage({
  oemItems,
  carfaxRecords,
  currentMiles,
  today = new Date(),
  dviFindings,
}: {
  oemItems: OEMItem[];
  carfaxRecords: Array<{ date?: string; odometer?: number; description?: string }>;
  currentMiles: number | null;
  today?: Date;
  dviFindings: Array<{ name?: string; status?: string | number }>;
}): Buckets {
  // last-done map from CARFAX
  const lastMap = new Map<string, LastDone>();
  for (const r of carfaxRecords || []) {
    const date = parseCarfaxDate(r.date ?? null);
    const miles = typeof r.odometer === "number" ? r.odometer : null;
    const desc = String(r.description || "").trim();
    const keys = toKeyFromFreeText(desc);
    for (const k of keys) {
      const prev = lastMap.get(k);
      const cand: LastDone = { miles, date };
      const prevScore = prev?.date ? prev.date.getTime() : -Infinity;
      const candScore = date ? date.getTime() : -Infinity;
      if (!prev || candScore > prevScore) lastMap.set(k, cand);
    }
  }

  // DVI bumps
  const dviMap = new Map<string, "red" | "yellow">();
  for (const it of dviFindings || []) {
    const key = it?.name ? toKeyFromName(String(it.name)) : null;
    if (!key) continue;
    const s = String(it.status ?? "");
    if (s === "0") dviMap.set(key, "red");
    else if (s === "1" && dviMap.get(key) !== "red") dviMap.set(key, "yellow");
  }

  const triaged: TriagedItem[] = [];

  for (const o of oemItems) {
    const key = toKeyFromName(o.name || "") || `misc_${o.maintenance_id}`;
    const last = lastMap.get(key) ?? null;
    const intervalMiles = o.miles ?? null;
    const intervalMonths = o.months ?? null;

    let dueAtMiles: number | null = null;
    let dueAtDate: Date | null = null;

    // Miles-based next due
    if (intervalMiles && intervalMiles > 0) {
      if (last?.miles != null) {
        dueAtMiles = last.miles + intervalMiles;
      } else if (currentMiles != null) {
        // align to next interval bucket if no history
        dueAtMiles = Math.ceil(currentMiles / intervalMiles) * intervalMiles;
      }
    }

    // Time-based next due
    if (intervalMonths && intervalMonths > 0) {
      if (last?.date) dueAtDate = addMonths(last.date, intervalMonths);
      else dueAtDate = addMonths(today, 0 + intervalMonths);
    }

    const milesToGo = currentMiles != null && dueAtMiles != null ? dueAtMiles - currentMiles : null;

    const daysToGo =
      dueAtDate != null ? Math.ceil((dueAtDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

    triaged.push({
      key,
      title: o.name,
      category: o.category,
      intervalMiles,
      intervalMonths,
      last: last || undefined,
      dueAtMiles,
      dueAtDate,
      milesToGo,
      daysToGo,
      bump: dviMap.get(key) ?? null,
    });
  }

  // thresholds
  const SOON_MILES = 1000;
  const SOON_DAYS = 30;

  const overdue: TriagedItem[] = [];
  const dueSoon: TriagedItem[] = [];
  const upcoming: TriagedItem[] = [];

  for (const t of triaged) {
    const mOver = t.milesToGo != null && t.milesToGo <= 0;
    const dOver = t.daysToGo != null && t.daysToGo <= 0;
    const mSoon = t.milesToGo != null && t.milesToGo > 0 && t.milesToGo <= SOON_MILES;
    const dSoon = t.daysToGo != null && t.daysToGo > 0 && t.daysToGo <= SOON_DAYS;

    // DVI bump forces severity
    if (t.bump === "red") {
      overdue.push(t);
      continue;
    }
    if (t.bump === "yellow") {
      if (!(mOver || dOver)) dueSoon.push(t);
      else overdue.push(t);
      continue;
    }

    if (mOver || dOver) overdue.push(t);
    else if (mSoon || dSoon) dueSoon.push(t);
    else upcoming.push(t);
  }

  // sort within buckets
  overdue.sort((a, b) => {
    const aBehind = (a.milesToGo ?? 0) < 0 ? -(a.milesToGo ?? 0) : 0;
    const bBehind = (b.milesToGo ?? 0) < 0 ? -(b.milesToGo ?? 0) : 0;
    return bBehind - aBehind; // most overdue first
  });
  dueSoon.sort((a, b) => {
    const aLeft = a.milesToGo ?? Infinity;
    const bLeft = b.milesToGo ?? Infinity;
    return aLeft - bLeft; // closest first
  });
  upcoming.sort((a, b) => {
    const aNext = a.dueAtMiles ?? Number.POSITIVE_INFINITY;
    const bNext = b.dueAtMiles ?? Number.POSITIVE_INFINITY;
    return aNext - bNext;
  });

  return { overdue, dueSoon, upcoming };
}

/* ---------------- Page ---------------- */
type PageProps = { params: Promise<{ vin: string }> };

export default async function VehiclePlanPage({ params }: PageProps) {
  const session = await requireSession();
  const db = await getDb();
  const shopId = Number(session.shopId);

  const { vin: vinParam } = await params;
  const vin = String(vinParam || "").toUpperCase();

  const vehicle = await db.collection("vehicles").findOne(
    { shopId, vin },
    { projection: { year: 1, make: 1, model: 1, vin: 1, lastMileage: 1, customerId: 1, updatedAt: 1 } }
  );

  // RO & DVI
  const ros = await db
    .collection("repair_orders")
    .find({ shopId, $or: [{ vin }, { vehicleId: vehicle?._id }] })
    .project({ roNumber: 1, status: 1, mileage: 1, updatedAt: 1, createdAt: 1 })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();
  const latestRoNumber = ros[0]?.roNumber ?? null;

  const autoCfg = await resolveAutoflowConfig(shopId);
  const dvi =
    latestRoNumber && autoCfg.configured
      ? await fetchDviWithCache(shopId, String(latestRoNumber), 10 * 60 * 1000)
      : { ok: false, error: latestRoNumber ? "AutoFlow not connected." : "No RO found." };

  // CARFAX
  const carfaxCfg = await resolveCarfaxConfig(shopId);
  const carfax = carfaxCfg.configured
    ? await fetchCarfaxWithCache(shopId, vin, 7 * 24 * 60 * 60 * 1000)
    : { ok: false, error: "CARFAX not configured." as const };

  // Miles/day (same “today miles” guard as detail page)
  let mpdBlended: number | null = null;
  if ((carfax as any).ok && Array.isArray((carfax as any).serviceRecords)) {
    const recs = (carfax as any).serviceRecords
      .map((r: any) => ({ date: parseCarfaxDate(r?.date ?? null), miles: typeof r?.odometer === "number" ? r.odometer : null }))
      .filter((r: any) => r.date && typeof r.miles === "number") as { date: Date; miles: number }[];
    recs.sort((a, b) => b.date.getTime() - a.date.getTime());

    const todayMiles =
      typeof vehicle?.lastMileage === "number" && vehicle.lastMileage > 0 && (!recs[0] || vehicle.lastMileage >= recs[0].miles)
        ? vehicle.lastMileage
        : null;

    let fromToday: number | null = null,
      fromTwo: number | null = null;

    if (todayMiles != null && recs[0]) {
      const d = Math.max(1, daysBetween(new Date(), recs[0].date));
      const val = (todayMiles - recs[0].miles) / d;
      fromToday = Math.abs(val) < 0.01 ? null : val; // ignore ~0.0 rates
    }
    if (recs[0] && recs[1]) {
      const d = Math.max(1, daysBetween(recs[0].date, recs[1].date));
      fromTwo = (recs[0].miles - recs[1].miles) / d;
    }
    mpdBlended = fromToday != null && fromTwo != null ? (fromToday + fromTwo) / 2 : fromTwo ?? fromToday ?? null;
  }

  // OEM schedule (local Mongo)
  const localOe = await getLocalOeFromMongo(vin);

  // Build normalized inputs
  const currentMiles = typeof vehicle?.lastMileage === "number" ? vehicle.lastMileage : null;

  const carfaxRecords: Array<{ date?: string; odometer?: number; description?: string }> =
    (carfax as any).ok && Array.isArray((carfax as any).serviceRecords)
      ? (carfax as any).serviceRecords.map((r: any) => ({
          date: r.date,
          odometer: r.odometer,
          description: String(r.description || ""),
        }))
      : [];

  const dviFindings: Array<{ name?: string; status?: string | number }> =
    (dvi as any).ok && Array.isArray((dvi as any).categories)
      ? (dvi as any).categories.flatMap((c: any) =>
          Array.isArray(c.items) ? c.items.map((it: any) => ({ name: it.name, status: it.status })) : []
        )
      : [];

  const oemItems: OEMItem[] = (localOe.items as any[]).map((x) => ({
    maintenance_id: x.maintenance_id,
    name: x.name,
    category: x.category,
    notes: x.notes,
    miles: x.miles ?? null,
    months: x.months ?? null,
  }));

  const buckets = triage({
    oemItems,
    carfaxRecords,
    currentMiles,
    dviFindings,
  });

  const counts = {
    overdue: buckets.overdue.length,
    soon: buckets.dueSoon.length,
    upcoming: buckets.upcoming.length,
  };

  // Pass data to the modern UI component
  const vehicleInfo = {
    year: vehicle?.year || null,
    make: vehicle?.make || null,
    model: vehicle?.model || null,
    vin,
    currentMiles,
    mpdBlended,
  };

  return (
    <PlanUI 
      buckets={buckets} 
      counts={counts} 
      vehicleInfo={vehicleInfo}
      debugData={{
        currentMiles,
        mpdBlended,
        carfaxOk: (carfax as any).ok ?? false,
        dviOk: (dvi as any).ok ?? false,
        oemCount: oemItems.length,
      }}
    />
  );
}
