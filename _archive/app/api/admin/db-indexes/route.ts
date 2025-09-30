// /app/api/admin/db-indexes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/mongo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || "mos-maintenance-mvp";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

async function getDb() {
  const client = await getMongo();
  return client.db(DB_NAME);
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("x-admin-token") || "";
  if (!ADMIN_TOKEN || auth !== ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const results: Record<string, any> = {};

  results.webhook_events = await db.collection("webhook_events").createIndexes([
    { key: { shopId: 1, receivedAt: -1 }, name: "by_shop_recent" },
    { key: { source: 1, eventType: 1, receivedAt: -1 }, name: "by_source_type_recent" },
    { key: { "payload.id": 1 }, name: "payload_id" },
  ]);

  results.vehicles = await db.collection("vehicles").createIndexes([
    { key: { vin: 1 }, name: "vin_unique", unique: true, sparse: true },
    { key: { shopId: 1 }, name: "by_shop" },
  ]);

  results.vehicleschedules = await db.collection("vehicleschedules").createIndexes([
    { key: { vin: 1 }, name: "vin_unique", unique: true, sparse: true },
    { key: { updatedAt: -1 }, name: "recent" },
  ]);

  results.shops = await db.collection("shops").createIndexes([
    { key: { slug: 1 }, name: "slug_unique", unique: true, sparse: true },
  ]);

  results.autoflow_credentials = await db.collection("autoflow_credentials").createIndexes([
    { key: { shopId: 1 }, name: "shop_unique", unique: true, sparse: true },
    { key: { createdAt: -1 }, name: "recent" },
  ]);

  return NextResponse.json({ ok: true, results });
}

