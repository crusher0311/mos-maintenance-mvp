import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const db = await getDb();
  const shop = req.nextUrl.searchParams.get("shop");
  if (!shop) return NextResponse.json({ error: "missing ?shop=" }, { status: 400 });

  // mirror the page's key constraints (VIN + not closed/appointment)
  const CLOSED_SET = ["closed", "Close", "CLOSED", "Appointment"];

  const shopIdNum = Number(shop);
  const shopIdStr = String(shop);

  const rows = await db.collection("customers").find(
    {
      $and: [
        { $or: [{ shopId: shopIdNum }, { shopId: shopIdStr }] },
        { status: { $nin: CLOSED_SET } },
        { "vehicle.vin": { $exists: true, $ne: "" } }
      ]
    },
    {
      projection: {
        name: 1, firstName: 1, lastName: 1,
        status: 1, lastStatus: 1, lastTicketId: 1, updatedAt: 1,
        vehicle: { year: 1, make: 1, model: 1, vin: 1, odometer: 1, license: 1 }
      }
    }
  ).sort({ updatedAt: -1 }).limit(50).toArray();

  return NextResponse.json({
    shop: shopIdStr,
    count: rows.length,
    sample: rows.slice(0, 5),
  });
}
