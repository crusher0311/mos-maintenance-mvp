import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Helpers -------------------------------------------------------------

function timingSafeEqual(a: Buffer, b: Buffer) {
  // same-length compare to avoid timing attacks
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyHmacSHA256(secret: string, rawBody: string, signatureHex: string) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signatureHex, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

async function findShopByToken(token: string) {
  const db = await getDb();
  const shop = await db
    .collection("shops")
    .findOne({ webhookToken: token }, { projection: { shopId: 1, name: 1 } });
  return shop;
}

// ---- GET: simple token validity check -----------------------------------

export async function GET(req: NextRequest, ctx: { params: { token: string } }) {
  const token = ctx.params?.token || "";
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  // optional ping param: /?ping=1
  const isPing = req.nextUrl.searchParams.has("ping");

  const shop = await findShopByToken(token);
  if (!shop) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  if (isPing) {
    return NextResponse.json({ ok: true, shopId: shop.shopId, tokenValid: true });
  }
  // If you want GET to do nothing else:
  return NextResponse.json({ ok: true, shopId: shop.shopId });
}

// ---- POST: accept webhook payload ---------------------------------------

export async function POST(req: NextRequest, ctx: { params: { token: string } }) {
  const token = ctx.params?.token || "";
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  const shop = await findShopByToken(token);
  if (!shop) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  // Read raw body for optional HMAC verification and for safe logging
  const raw = await req.text();
  let payload: any = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    // keep payload as null; raw will still be saved
  }

  // OPTIONAL signature verification (enable by setting AUTOFLOW_SIGNING_SECRET)
  const secret = process.env.AUTOFLOW_SIGNING_SECRET || "";
  if (secret) {
    // Common header names; adjust if AutoFlow uses a specific one
    const sig =
      req.headers.get("x-autoflow-signature") ||
      req.headers.get("x-signature") ||
      "";
    if (!sig || !verifyHmacSHA256(secret, raw, sig)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  // Persist the event for debugging/auditing
  const db = await getDb();
  await db.collection("events").insertOne({
    provider: "autoflow",
    shopId: shop.shopId,
    token,
    payload,
    raw, // optional: keep raw for debugging
    receivedAt: new Date(),
  });

  return NextResponse.json({ ok: true, shopId: shop.shopId });
}
