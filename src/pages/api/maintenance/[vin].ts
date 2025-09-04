// src/pages/api/maintenance/[vin].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB || "mos-maintenance-mvp";

// cache client across hot reloads
let _client: MongoClient | null = null;
async function getClient() {
  if (_client) return _client;
  _client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
  await _client.connect();
  return _client;
}

function toSquish(vin: string) {
  const v = String(vin).toUpperCase().trim();
  if (v.length !== 17) throw new Error("VIN must be 17 characters");
  return v.slice(0, 8) + v.slice(9, 11);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const vin = String(req.query.vin || "");
    const squish = toSquish(vin);

    const client = await getClient();
    const db = client.db(dbName);

    const pipeline = [
      { $match: { squish } },
      { $project: { _id: 0, squish: 1, vin_maintenance_id: 1, maintenance_id: 1 } },
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
      {
        $lookup: {
          from: "dataone_def_maintenance_interval",
          localField: "intervals.maintenance_interval_id",
          foreignField: "maintenance_interval_id",
          as: "intDef",
        },
      },
      { $unwind: "$intDef" },
      {
        $lookup: {
          from: "dataone_def_maintenance",
          localField: "maintenance_id",
          foreignField: "maintenance_id",
          as: "def",
        },
      },
      { $unwind: "$def" },
      {
        $group: {
          _id: { maintenance_id: "$maintenance_id", interval_id: "$intervals.maintenance_interval_id" },
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
      {
        $addFields: {
          miles: {
            $let: {
              vars: { m: { $filter: { input: "$intervals", as: "i", cond: { $eq: ["$$i.units", "Miles"] } } } },
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
              vars: { m: { $filter: { input: "$intervals", as: "i", cond: { $eq: ["$$i.units", "Months"] } } } },
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

    res.status(200).json({ vin, squish, count: items.length, items });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Unexpected error" });
  }
}
