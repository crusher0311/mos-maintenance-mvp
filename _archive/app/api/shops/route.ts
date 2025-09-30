// /app/api/shops/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ShopDoc = {
  shopId: string;          // URL-safe slug or short id you assign
  name: string;
  contactEmail?: string;
  token: string;           // used in webhook URL path
  autoflow?: {
    apiKey?: string;
    apiBaseUrl?: string;
    webhookSecret?: string;
  };
  createdAt: number;
  updatedAt: number;
};

export async function GET() {
  const db = await getDb();
  const shops = await db
    .collection<ShopDoc>("shops")
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  return NextResponse.json({ shops });
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json().catch(() => ({}));
    const name = (body?.name || "").trim();
    const shopId = (body?.shopId || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const contactEmail = (body?.contactEmail || "").trim();

    if (!name || !shopId) {
      return NextResponse.json({ error: "name and shopId are required" }, { status: 400 });
    }

    const exists = await db.collection("shops").findOne({ shopId });
    if (exists) {
      return NextResponse.json({ error: "shopId already exists" }, { status: 409 });
    }

    const token = crypto.randomBytes(16).toString("hex");
    const now = Date.now();
    const doc: ShopDoc = {
      shopId,
      name,
      contactEmail,
      token,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("shops").insertOne(doc);

    return NextResponse.json({ ok: true, shop: doc }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

