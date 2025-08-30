// /app/api/webhooks/autoflow/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function verifySignature(raw: string, secret: string, provided?: string | null) {
  if (!secret || !provided) return true; // allow if no secret configured (MVP)
  try {
    const h = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
    // Constant-time compare
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(provided));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Read raw body for signature verification
  const raw = await req.text();
  let json: any = {};
  try { json = JSON.parse(raw || "{}"); } catch { /* ignore */ }

  const db = await getDb();
  const shop = await db.collection("shops").findOne({ token });
  if (!shop) return NextResponse.json({ error: "Unknown token" }, { status: 404 });

  // Optional signature header if provider supports it
  const providedSig = req.headers.get("x-autoflow-signature");
  const secret = shop?.autoflow?.webhookSecret || "";
  if (!verifySignature(raw, secret, providedSig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Store raw event (MVP)
  await db.collection("webhook_events").insertOne({
    shopId: shop.shopId,
    token,
    headers: Object.fromEntries(req.headers.entries()),
    body: json,
    raw,
    receivedAt: Date.now(),
    source: "autoflow",
  });

  // TODO: translate event -> upserts/work queue
  return NextResponse.json({ ok: true });
}
