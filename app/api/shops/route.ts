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

    const webhookToken = crypto.randomBytes(12).toString("hex");
    const now = new Date();

    // Retry a few times in case we ever collide (e.g., counter was lagging)
    const MAX_TRIES = 5;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const numericId = await getNextShopId(); // should be >= 10001 after admin sync
      const doc = {
        shopId: numericId,
        name: name.trim(),
        webhookToken,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await shops.insertOne(doc);
        return NextResponse.json({
          shop: { shopId: numericId, name: doc.name, webhookToken },
        });
      } catch (err: any) {
        if (err?.code === 11000 && attempt < MAX_TRIES) {
          // duplicate key – try the next id
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json(
      { error: "Could not allocate a unique shopId after multiple attempts" },
      { status: 500 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

