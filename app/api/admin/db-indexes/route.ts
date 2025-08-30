import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-admin-token") || "";
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  await db.collection("shops").createIndex({ shopId: 1 }, { unique: true, name: "shops_shopId_unique" });
  await db.collection("shops").createIndex({ "autoflow.webhookToken": 1 }, { name: "shops_webhookToken" });
  await db.collection("events").createIndex({ shopId: 1, createdAt: -1 }, { name: "events_shopId_createdAt" });
  return NextResponse.json({ ok: true });
}
