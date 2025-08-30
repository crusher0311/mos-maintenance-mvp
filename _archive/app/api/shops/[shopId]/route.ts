// /app/api/shops/[shopId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const db = await getDb();
  const shop = await db.collection("shops").findOne({ shopId }, { projection: { _id: 0 } });
  if (!shop) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ shop });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const db = await getDb();
  const body = await req.json().catch(() => ({}));
  const update: any = {};
  if (body?.name) update.name = String(body.name);
  if (body?.contactEmail) update.contactEmail = String(body.contactEmail);
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  update.updatedAt = Date.now();
  const r = await db.collection("shops").findOneAndUpdate(
    { shopId },
    { $set: update },
    { returnDocument: "after", projection: { _id: 0 } }
  );
  if (!r.value) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, shop: r.value });
}
