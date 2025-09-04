// app/lib/models/VehicleSchedule.ts
import { Schema, model, models } from "mongoose";

const VehicleScheduleSchema = new Schema(
  {
    vin: { type: String, required: true, unique: true, index: true },
    provider: { type: String, default: "vehicle-databases" },
    status: { type: Number, default: 200 },
    raw: { type: Schema.Types.Mixed }, // OE payload (any shape)
    fetchedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true } // adds createdAt / updatedAt
);

export type VehicleScheduleDoc = {
  vin: string;
  provider?: string;
  status?: number;
  raw?: any;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const VehicleSchedule =
  models.VehicleSchedule || model<VehicleScheduleDoc>("VehicleSchedule", VehicleScheduleSchema);

