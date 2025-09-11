// /app/api/shops/[shopId]/credentials/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const db = await getDb();
  const body = await req.json().catch(() => ({}));

  const autoflow: any = {};
  if (body?.apiKey != null) autoflow.apiKey = String(body.apiKey);
  if (body?.apiBaseUrl != null) autoflow.apiBaseUrl = String(body.apiBaseUrl);
  if (body?.webhookSecret != null) autoflow.webhookSecret = String(body.webhookSecret);

  if (!Object.keys(autoflow).length) {
    return NextResponse.json({ error: "No credential fields provided" }, { status: 400 });
  }

  const r = await db.collection("shops").findOneAndUpdate(
    { shopId },
    { $set: { autoflow, updatedAt: Date.now() } },
    { returnDocument: "after", projection: { _id: 0 } }
  );
  if (!r.value) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, shop: r.value });
}
