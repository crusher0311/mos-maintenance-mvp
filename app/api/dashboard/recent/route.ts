// app/api/dashboard/recent/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/mongo";
import { auth } from "@/lib/auth"; // however you read the session

export async function GET() {
  const session = await auth();
  const shopId = session?.user?.shopId; // 13 in your screenshot
  if (!shopId) return NextResponse.json({ items: [] });

  const pipeline = [
    { $match: { shopId, provider: "autoflow" } },       // your schema
    { $sort: { createdAt: -1 } },
    // pick the latest event per RO or VIN (choose one key)
    { $group: {
        _id: "$payload.ticket.roNumber",                // or "$payload.vehicle.vin"
        latest: { $first: "$$ROOT" }
    }},
    // exclude appointments if your UI hides them
    { $match: { "latest.payload.ticket.status": { $nin: ["appointment_create", "appointment_scheduled"] } } },
    // project the fields your table needs
    { $project: {
        _id: 0,
        name: "$latest.payload.customer.name",
        roNumber: "$latest.payload.ticket.roNumber",
        vin: "$latest.payload.vehicle.vin",
        vehicle: {
          $concat: ["$latest.payload.vehicle.year", " ", "$latest.payload.vehicle.make", " ", "$latest.payload.vehicle.model"]
        },
        status: "$latest.payload.ticket.status",
        dvi: "$latest.payload.dvi.status",
        odometer: {
          $ifNull: [
            "$latest.payload.ticket.mileage",
            { $ifNull: ["$latest.payload.vehicle.odometer", null] }
          ]
        },
        updatedAt: "$latest.createdAt"
    }}},
    { $limit: 50 }
  ];

  const items = await db.collection("events").aggregate(pipeline).toArray();
  return NextResponse.json({ items });
}
