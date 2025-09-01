// app/api/vehicles/[vin]/refresh/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

/**
 * POST /api/vehicles/[vin]/refresh
 * Body: { shopId: number, customerExternalId: string }
 *
 * For now: enqueue a "vehicle-refresh" job record and respond 202.
 * Next: call importers (DVI, DataOne, Carfax), then generate AI recommendations and save a summary doc.
 */
export async function POST(req: Request, ctx: { params: { vin: string } }) {
  try {
    const vinParam = ctx.params.vin?.toUpperCase();
    const body = await req.formData().catch(async () => {
      // if sent as JSON
      const j = await req.json().catch(() => null);
      const fd = new FormData();
      if (j && typeof j === "object") {
        for (const [k, v] of Object.entries(j)) fd.set(k, String(v));
      }
      return fd;
    });

    const shopId = Number(body.get("shopId"));
    const customerExternalId = String(body.get("customerExternalId") || "");

    if (!vinParam || !Number.isFinite(shopId) || !customerExternalId) {
      return NextResponse.json({ error: "Missing vin/shopId/customerExternalId" }, { status: 400 });
    }

    const db = await getDb();
    const now = new Date();

    // Record a "job" so we can see activity (and retry later if needed)
    await db.collection("jobs").insertOne({
      type: "vehicle-refresh",
      shopId,
      vin: vinParam,
      customerExternalId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    // TODO: call integration importers here (make these functions next):
    // await importDVI({ shopId, vin: vinParam, customerExternalId });
    // await importDataOne({ shopId, vin: vinParam });
    // await importCarfax({ shopId, vin: vinParam });
    // await buildRecommendations({ shopId, vin: vinParam, customerExternalId });

    return NextResponse.redirect(
      `/dashboard/customers/${encodeURIComponent(customerExternalId)}/vehicles/${encodeURIComponent(vinParam)}`,
      { status: 303 }
    );
  } catch (err) {
    console.error("vehicle refresh error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
