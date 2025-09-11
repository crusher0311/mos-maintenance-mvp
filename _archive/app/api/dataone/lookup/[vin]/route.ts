import { NextRequest, NextResponse } from "next/server";
import { getDataOneDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

function upper(v?: string) { return (v || "").toUpperCase(); }

export async function GET(
  req: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const vin = upper(params?.vin);
    if (vin.length !== 17) {
      return NextResponse.json({ error: "VIN must be 17 characters", vin }, { status: 400 });
    }

    const db = await getDataOneDb();
    const lkpVin = db.collection("LKP_VIN_MAINTENANCE");
    const lkpYmm = db.collection("LKP_YMM_MAINTENANCE");

    const url = new URL(req.url);
    const year  = url.searchParams.get("year");
    const make  = url.searchParams.get("make");
    const model = url.searchParams.get("model");

    const WMI = vin.slice(0, 3);
    const VDS = vin.slice(3, 9);

    // Try VIN mapping first (adjust field names to your dataset if needed)
    let lkp =
      await lkpVin.findOne({ WMI, VDS }) ||
      await lkpVin.findOne({ wmi: WMI, vds: VDS });

    // Fallback: YMM (if provided)
    if (!lkp && (year || make || model)) {
      const q: any = {};
      if (year)  q.Year  = Number(year);
      if (make)  q.Make  = make;
      if (model) q.Model = model;
      lkp = await lkpYmm.findOne(q);
    }

    // Pull schedule id(s)
    const scheduleIds: any[] = [];
    if (lkp) {
      for (const k of Object.keys(lkp)) {
        if (/schedule/i.test(k)) scheduleIds.push(lkp[k]);
      }
    }

    // If we have schedules, join events->intervals->ops for a small sample
    let sample: any[] = [];
    if (scheduleIds.length) {
      sample = await db.collection("DEF_MAINTENANCE_EVENT").aggregate([
        { $match: { $or: [{ ScheduleID: { $in: scheduleIds } }, { schedule_id: { $in: scheduleIds } }] } },
        { $limit: 5 },
        { $lookup: {
            from: "DEF_MAINTENANCE_INTERVAL",
            let: { evId: "$EventID" },
            pipeline: [
              { $match: { $expr: { $eq: ["$EventID", "$$evId"] } } },
              { $project: { _id: 0, Miles: 1, MILES:1, Months:1, MONTHS:1, Type:1, TYPE:1 } },
            ],
            as: "intervals"
          }
        },
        { $lookup: {
            from: "DEF_MAINTENANCE_OPERATING_PARAMETER",
            let: { evId: "$EventID" },
            pipeline: [
              { $match: { $expr: { $eq: ["$EventID", "$$evId"] } } },
              { $project: { _id: 0 } },
            ],
            as: "ops"
          }
        },
        { $project: {
            _id: 0,
            ScheduleID: 1,
            EventID: 1,
            Category: 1,
            EventName: 1,
            ScheduleName: 1,
            intervals: 1,
            ops: 1,
          }
        }
      ]).toArray();
    }

    return NextResponse.json({
      vin,
      mappingFound: !!lkp,
      scheduleIds,
      sampleEventsJoined: sample,
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
