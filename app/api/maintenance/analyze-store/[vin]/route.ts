import { NextRequest } from "next/server";
import { getMongo } from "@/lib/mongo";

/** Count buckets from your existing analyzer response (robust to shape differences). */
function countsFromAnalyze(raw: any) {
  const root = raw?.analysis?.maintenance_comparison ?? raw?.analysis ?? raw;
  const buckets = { overdue: 0, soon: 0, notYet: 0 };
  if (!root || typeof root !== "object") return { overdue: 0, comingSoon: 0, notYet: 0 };

  const add = (arr: any, key: keyof typeof buckets) => {
    if (Array.isArray(arr)) buckets[key] += arr.length;
  };

  // services/items list with per-item status
  const services = root.services ?? root.items ?? root.list;
  if (Array.isArray(services)) {
    for (const it of services) {
      const s = String(it?.status ?? it?.recommendation_status ?? it?.category ?? "").toLowerCase();
      if (s.includes("overdue") || s.includes("past")) buckets.overdue++;
      else if (s.includes("soon")) buckets.soon++;
      else buckets.notYet++;
    }
  }

  // groups container
  if (root.groups) {
    add(root.groups.overdue ?? root.groups.past_due, "overdue");
    add(root.groups.coming_soon ?? root.groups.dueSoon ?? root.groups.due_soon, "soon");
    add(root.groups.not_yet ?? root.groups.notYet, "notYet");
  }

  // arrays on root with telltale names
  for (const k of Object.keys(root)) {
    const v = (root as any)[k];
    if (!Array.isArray(v)) continue;
    const key = k.toLowerCase();
    if (key.includes("overdue") || key.includes("past")) buckets.overdue += v.length;
    else if (key.includes("soon") || key.includes("coming") || key.includes("due_soon")) buckets.soon += v.length;
    else if (key.includes("not_yet") || key.includes("notyet") || key.includes("future")) buckets.notYet += v.length;
  }

  return { overdue: buckets.overdue, comingSoon: buckets.soon, notYet: buckets.notYet };
}

export async function POST(req: NextRequest, { params }: { params: { vin: string } }) {
  const vin = decodeURIComponent(params.vin);
  const origin = new URL(req.url).origin;

  // Try to forward caller body; if none, use {}
  let body: any = {};
  try { body = await req.json(); } catch {}

  // 1) Call your existing analyzer route
  const res = await fetch(`${origin}/api/maintenance/analyze/${encodeURIComponent(vin)}?r=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    return new Response(await res.text(), { status: res.status });
  }

  const raw = await res.json();

  // 2) Compute counts and save to Mongo
  const counts = countsFromAnalyze(raw);
  const vehicle = {
    vin,
    year: raw?.year ?? raw?.vehicle?.year,
    make: raw?.make ?? raw?.vehicle?.make,
    model: raw?.model ?? raw?.vehicle?.model,
    trim: raw?.trim ?? raw?.vehicle?.trim,
    avgMilesPerDay: raw?.miles_per_day_used ?? raw?.avgMilesPerDay,
  };

  const client = await getMongo();
  const db = client.db();
  const analyses = db.collection("analyses");
  const vehicles = db.collection("vehicles");

  await vehicles.updateOne(
    { vin },
    { $set: vehicle, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );

  await analyses.insertOne({
    vin,
    counts,
    raw,
    createdAt: new Date(),
  });

  // Create helpful indexes (safe to call repeatedly)
  await analyses.createIndex({ vin: 1, createdAt: -1 });
  await vehicles.createIndex({ vin: 1 }, { unique: true });

  // 3) Return the analyzer JSON unchanged
  return Response.json(raw, { status: 200 });
}
