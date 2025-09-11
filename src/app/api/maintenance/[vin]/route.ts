// src/app/api/maintenance/[vin]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB || "mos-maintenance-mvp";

// simple global client cache for Next.js (avoids new connections on hot reload)
let _client: MongoClient | null = null;
async function getClient() {
  if (_client) return _client;
  _client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });
  await _client.connect();
  return _client;
}

function toSquish(vin: string) {
  const v = String(vin).toUpperCase().trim();
  if (v.length !== 17) throw new Error("VIN must be 17 characters");
  return v.slice(0, 8) + v.slice(9, 11); // e.g. 5N1AR1NBCC
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const vin = params.vin;
    const squish = toSquish(vin);

    const client = await getClient();
    const db = client.db(dbName);

    const pipeline = [
      { $match: { squish } },
      { $project: { _id: 0, squish: 1, vin_maintenance_id: 1, maintenance_id: 1 } },

      // Join intervals via vin_maintenance_id
      {
        $lookup: {
          from: "dataone_lkp_vin_maintenance_interval",
          let: { vmi: "$vin_maintenance_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$vin_maintenance_id", "$$vmi"] } } },
            { $project: { _id: 0, maintenance_interval_id: 1 } },
          ],
          as: "intervals",
        },
      },
      { $unwind: "$intervals" },

      // Interval definitions
      {
        $lookup: {
          from: "dataone_def_maintenance_interval",
          localField: "intervals.maintenance_interval_id",
          foreignField: "maintenance_interval_id",
          as: "intDef",
        },
      },
      { $unwind: "$intDef" },

      // Maintenance definitions
      {
        $lookup: {
          from: "dataone_def_maintenance",
          localField: "maintenance_id",
          foreignField: "maintenance_id",
          as: "def",
        },
      },
      { $unwind: "$def" },

      // Dedupe per (maintenance_id, interval_id)
      {
        $group: {
          _id: {
            maintenance_id: "$maintenance_id",
            interval_id: "$intervals.maintenance_interval_id",
          },
          squish: { $first: "$squish" },
          maintenance_name: { $first: "$def.maintenance_name" },
          maintenance_category: { $first: "$def.maintenance_category" },
          maintenance_notes: { $first: "$def.maintenance_notes" },
          interval_type: { $first: "$intDef.interval_type" },
          value: { $first: "$intDef.value" },
          units: { $first: "$intDef.units" },
          initial_value: { $first: "$intDef.initial_value" },
        },
      },

      // Roll up to one doc per maintenance_id; keep all intervals
      {
        $group: {
          _id: "$_id.maintenance_id",
          squish: { $first: "$squish" },
          maintenance_name: { $first: "$maintenance_name" },
          maintenance_category: { $first: "$maintenance_category" },
          maintenance_notes: { $first: "$maintenance_notes" },
          intervals: {
            $push: {
              interval_id: "$_id.interval_id",
              type: "$interval_type",
              value: "$value",
              units: "$units",
              initial_value: "$initial_value",
            },
          },
        },
      },

      // Extract first Miles & Months values
      {
        $addFields: {
          miles: {
            $let: {
              vars: {
                m: {
                  $filter: {
                    input: "$intervals",
                    as: "i",
                    cond: { $eq: ["$$i.units", "Miles"] },
                  },
                },
              },
              in: {
                $cond: [
                  { $gt: [{ $size: "$$m" }, 0] },
                  { $arrayElemAt: [{ $map: { input: "$$m", as: "x", in: "$$x.value" } }, 0] },
                  null,
                ],
              },
            },
          },
          months: {
            $let: {
              vars: {
                m: {
                  $filter: {
                    input: "$intervals",
                    as: "i",
                    cond: { $eq: ["$$i.units", "Months"] },
                  },
                },
              },
              in: {
                $cond: [
                  { $gt: [{ $size: "$$m" }, 0] },
                  { $arrayElemAt: [{ $map: { input: "$$m", as: "x", in: "$$x.value" } }, 0] },
                  null,
                ],
              },
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          maintenance_id: "$_id",
          name: "$maintenance_name",
          category: "$maintenance_category",
          notes: "$maintenance_notes",
          miles: 1,
          months: 1,
          intervals: 1,
        },
      },
      { $sort: { category: 1, name: 1 } },
      { $limit: 200 },
    ];

    const items = await db
      .collection("dataone_lkp_vin_maintenance")
      .aggregate(pipeline, { allowDiskUse: true, hint: "squish_1" })
      .toArray();

    return NextResponse.json({ vin, squish, count: items.length, items });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 400 }
    );
  }
}
