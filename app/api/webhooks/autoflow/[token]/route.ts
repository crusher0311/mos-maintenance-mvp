import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { token: string }}) {
  const token = params.token;
  const db = await getDb();

  const shop = await db.collection("shops").findOne(
    { "autoflow.webhookToken": token },
    { projection: { _id: 0, shopId: 1 } }
  );
  if (!shop) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const payload = await req.json().catch(() => ({}));
  await db.collection("events").insertOne({
    shopId: shop.shopId,
    source: "autoflow",
    payload,
    createdAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
