import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function id(n=12) { return crypto.randomBytes(n).toString("hex"); }

export async function GET() {
  const db = await getDb();
  const rows = await db.collection("shops")
    .find({}, { projection: { _id: 0, shopId: 1, name: 1, "autoflow.webhookToken": 1 } })
    .sort({ name: 1 }).toArray();
  return NextResponse.json({ shops: rows });
}

export async function POST(req: NextRequest) {
  const db = await getDb();
  const body = await req.json().catch(() => ({} as any));
  const name = (body?.name || "").toString().trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const shopId = id(6);
  const webhookToken = id(12);
  const doc = {
    shopId, name,
    autoflow: { apiKey: null as string|null, apiBase: null as string|null, webhookToken },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await db.collection("shops").insertOne(doc as any);
  return NextResponse.json({ shop: { shopId, name, webhookToken } }, { status: 201 });
}
