// src/lib/models.js
import mongoose, { Schema } from "mongoose";

// --- Vehicle ---
const VehicleSchema = new Schema({
  vin:   { type: String, required: true, unique: true },
  year:  Number,
  make:  String,
  model: String,
  plate: String,
}, { timestamps: true });

// --- Odometer Points ---
const OdometerPointSchema = new Schema({
  vin:   { type: String, required: true, index: true },
  date:  { type: Date,   required: true, index: true },
  miles: { type: Number, required: true },
}, { timestamps: true });

// --- Inspection Findings ---
const InspectionFindingSchema = new Schema({
  vin:     { type: String, required: true, index: true },
  visitId: { type: String },    // RO# or remote_ticket_id if available
  code:    String,              // item_id or normalized key
  label:   { type: String, required: true },
  status:  { type: String, enum: ["red","yellow","green"], required: true },
  notes:   String,
}, { timestamps: true });

// --- Export models (reuse if already compiled) ---
export const Vehicle = mongoose.models.Vehicle || mongoose.model("Vehicle", VehicleSchema);
export const OdometerPoint = mongoose.models.OdometerPoint || mongoose.model("OdometerPoint", OdometerPointSchema);
export const InspectionFinding = mongoose.models.InspectionFinding || mongoose.model("InspectionFinding", InspectionFindingSchema);
