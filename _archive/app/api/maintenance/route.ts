import { MongoClient } from "mongodb";

const MONGO_URL = process.env.MONGO_URL!;
const MONGO_DB = process.env.MONGO_DB!;

let cached: MongoClient | null = null;
async function getDb() {
  if (!cached || !(cached as any).topology?.isConnected()) {
    cached = await MongoClient.connect(MONGO_URL);
  }
  return cached.db(MONGO_DB);
}

type Interval = { type: "At" | "Every"; value: number | null; units: "miles" | "months" | "hours"; initial?: number | null };
type Service = { name?: string; category?: string; notes?: string; intervals: Interval[] };

function computeStatus(svc: Service, currentMileage = 0) {
  // MVP: if any mileage interval's first due point is <= current mileage â†’ DUE
  const miles = (svc.intervals || []).filter(i => i.units === "miles" && i.value != null);
  for (const iv of miles) {
    const first = iv.initial ?? iv.value!;
    if (currentMileage >= first) return "DUE";
  }
  return "UPCOMING";
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // For now we accept explicit Y/M/M in the query (weâ€™ll swap to VIN decode next)
  const year  = url.searchParams.get("year");
  const make  = url.searchParams.get("make");
  const model = url.searchParams.get("model");
  const currentMileage = Number(url.searchParams.get("currentMileage") || 0);

  if (!year || !make || !model) {
    return new Response(JSON.stringify({ error: "Provide year, make, model for now." }), { status: 400 });
  }

  const key = `${year}|${make}|${model}`;
  const db = await getDb();
  const doc = await db.collection("services_by_ymm").findOne({ _id: key });

  if (!doc) {
    return new Response(JSON.stringify({ key, services: [] }), { status: 200 });
  }

  const services: Service[] = (doc as any).services || [];
  const enriched = services.map(s => ({ ...s, status: computeStatus(s, currentMileage) }));

  return new Response(JSON.stringify({ key, count: enriched.length, services: enriched }), { status: 200 });
}

