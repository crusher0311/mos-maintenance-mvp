import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { shopId: string }}) {
  const { shopId } = params;
  const db = await getDb();
  const body = await req.json().catch(() => ({} as any));
  const apiKey  = (body?.apiKey  ?? null) as string|null;
  const apiBase = (body?.apiBase ?? null) as string|null;

  const r = await db.collection("shops").updateOne(
    { shopId },
    { $set: { "autoflow.apiKey": apiKey, "autoflow.apiBase": apiBase, updatedAt: Date.now() } }
  );
  if (!r.matchedCount) return NextResponse.json({ error: "shop not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
