import { NextRequest, NextResponse } from "next/server";
import { getDataOneDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

const EXPECTED = [
  "DEF_MAINTENANCE",
  "DEF_MAINTENANCE_EVENT",
  "DEF_MAINTENANCE_INTERVAL",
  "DEF_MAINTENANCE_SCHEDULE",
  "DEF_MAINTENANCE_OPERATING_PARAMETER",
  "LKP_VIN_MAINTENANCE",
  "LKP_YMM_MAINTENANCE",
  // add others if you imported them
  "services_by_schedule", // optional materialized view
];

export async function GET(_req: NextRequest) {
  try {
    const db = await getDataOneDb();
    const existing = await db.listCollections({}, { nameOnly: true }).toArray();
    const existingNames = new Set(existing.map(c => c.name));

    const details = [];
    for (const name of EXPECTED) {
      if (!existingNames.has(name)) {
        details.push({ name, exists: false });
        continue;
      }
      const col = db.collection(name);
      const count = await col.estimatedDocumentCount().catch(() => 0);
      const sample = await col.find({}).limit(1).toArray();
      const keys = sample[0] ? Object.keys(sample[0]) : [];
      details.push({ name, exists: true, count, sampleKeys: keys });
    }

    return NextResponse.json({
      ok: true,
      db: db.databaseName,
      collectionsFound: existing.map(c => c.name),
      expectedStatus: details,
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

