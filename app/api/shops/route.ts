// app/api/shops/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/mongo";
import { getNextShopId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/shops
 * Body: { name: string }
 * Returns: { shop: { shopId: number, name: string, webhookToken: string } }
 */
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const db = await getDb();
    const shops = db.collection("shops");

    // 1) Generate human-friendly numeric ID
    const numericId = await getNextShopId(); // starts >= 10001 (seeded in Step 1)

    // 2) Secure, unguessable webhook token
    const webhookToken = crypto.randomBytes(12).toString("hex");

    // 3) Insert document
    const now = new Date();
    const doc = {
      shopId: numericId, // numeric, unique (enforced by index)
      name: name.trim(),
      webhookToken,
      createdAt: now,
      updatedAt: now,
    };

    await shops.insertOne(doc);

    // 4) Return Tekmetric-style id + token
    return NextResponse.json({
      shop: { shopId: numericId, name: doc.name, webhookToken },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * (Optional) Keep your existing GET handler if you have one.
 * You can also add a simple GET here that lists shops, but it’s not required for Step 2.
 */
