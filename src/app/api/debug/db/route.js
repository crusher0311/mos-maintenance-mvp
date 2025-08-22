// src/app/api/debug/db/route.js
import { dbConnect } from "@/lib/db";
import mongoose from "mongoose";
import { OdometerPoint, InspectionFinding, Vehicle } from "@/lib/models";

export async function GET() {
  await dbConnect();
  const conn = mongoose.connection;
  const dbName = conn?.name || "(unknown)";
  const uri = process.env.MONGODB_URI || "(no MONGODB_URI)";

  const vin = "1FT8W3BT0BEA08647";
  const odoCount = await OdometerPoint.countDocuments({ vin });
  const findCount = await InspectionFinding.countDocuments({ vin });
  const vehCount = await Vehicle.countDocuments({ vin });

  return Response.json({
    connectedDb: dbName,
    uriSample: uri.replace(/:\/\/.*@/, "://***:***@"), // mask creds if present
    countsForVin: { vin, odometerpoints: odoCount, inspectionfindings: findCount, vehicles: vehCount },
  });
}
