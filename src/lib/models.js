// src/lib/models.js
import mongoose, { Schema } from "mongoose";

/* -------------------- Vehicle -------------------- */
const VehicleSchema = new Schema(
  {
    vin:   { type: String, required: true, unique: true },
    year:  Number,
    make:  String,
    model: String,
    plate: String,
  },
  { timestamps: true }
);

/* ----------------- OdometerPoint ----------------- */
const OdometerPointSchema = new Schema(
  {
    vin:   { type: String, required: true, index: true },
    date:  { type: Date,   required: true, index: true },
    miles: { type: Number, required: true },
  },
  { timestamps: true }
);

/* --------------- InspectionFinding --------------- */
const InspectionFindingSchema = new Schema(
  {
    vin:     { type: String, required: true, index: true },
    visitId: { type: String }, // RO#/ticket if available
    code:    String,           // item_id or normalized key
    label:   { type: String, required: true },
    status:  { type: String, enum: ["red","yellow","green"], required: true },
    notes:   String,
  },
  { timestamps: true }
);

/* ------------------- WebhookLog ------------------ */
const WebhookLogSchema = new Schema(
  {
    source:     { type: String, default: "autoflow" },
    url:        { type: String },
    headers:    { type: Object },
    body:       { type: Object },
    receivedAt: { type: Date, default: Date.now },
    ok:         { type: Boolean, default: true },
    error:      { type: String, default: "" },
  },
  { timestamps: true }
);

/* --------------- Export (reuse models) ----------- */
export const Vehicle =
  mongoose.models.Vehicle || mongoose.model("Vehicle", VehicleSchema);

export const OdometerPoint =
  mongoose.models.OdometerPoint || mongoose.model("OdometerPoint", OdometerPointSchema);

export const InspectionFinding =
  mongoose.models.InspectionFinding || mongoose.model("InspectionFinding", InspectionFindingSchema);

export const WebhookLog =
  mongoose.models.WebhookLog || mongoose.model("WebhookLog", WebhookLogSchema);
