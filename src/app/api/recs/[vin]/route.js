// src/app/api/recs/[vin]/route.js
import { getCarfaxPoints, getDvi } from "@/lib/state";

function milesPerDay(points) {
  if (!points || points.length < 2) return 30;
  const a = points[points.length - 2], b = points[points.length - 1];
  const days = (new Date(b.date) - new Date(a.date)) / 86400000;
  const miles = b.odo - a.odo;
  return Math.max(0, Math.round((miles / Math.max(days, 1)) * 10) / 10);
}

function etaByMiles(current, target, mpd) {
  const d = new Date();
  const days = Math.ceil(Math.max(0, target - current) / Math.max(mpd, 1));
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString();
}

export async function GET(req, { params }) {
  const { vin } = params;
  const url = new URL(req.url);
  const currentMiles = Number(url.searchParams.get("mileage") || 103265);

  // Severe schedule (mock for now)
  const schedule = {
    oil_interval_mi: 7500,
    fuel_filter_interval_mi: 15000,
    air_filter_interval_mi: 15000,
    trans_interval_mi: 60000,
    coolant_interval_mi: 60000,
  };

  // Prefer ingested Carfax points; otherwise fall back to defaults
  const points =
    getCarfaxPoints().length > 0
      ? getCarfaxPoints()
      : [
          { date: "2024-09-19", odo: 94615 },
          { date: "2025-01-29", odo: 95150 },
          { date: "2025-08-21", odo: 103265 },
        ];

  const mpd = milesPerDay(points);

  const risks = {
    oil: "Engine wear, sludge, turbo damage",
    fuel: "Hard starts, injector failure ($$$)",
    air: "Poor mileage, engine strain, black smoke",
    trans: "Harsh shifts, overheating, failure",
    coolant: "Overheating, head gasket leaks",
  };

  // Last-known service mileages (from our earlier analysis)
  const lastOilMiles = 94615;      // 2024-09-19
  const lastFuelMiles = 85879;     // 2023-10-26
  const lastAirMiles = 82648;      // 2021
  const lastTransMiles = 49218;    // 2020
  const lastCoolantMiles = 80750;  // 2021

  const items = [
    { icon: "🛢️", title: "Oil & Filter",        dueMi: lastOilMiles    + schedule.oil_interval_mi,         risk: risks.oil },
    { icon: "⛽",  title: "Fuel Filter",         dueMi: lastFuelMiles   + schedule.fuel_filter_interval_mi,  risk: risks.fuel },
    { icon: "🌬️", title: "Air Filter",          dueMi: lastAirMiles    + schedule.air_filter_interval_mi,   risk: risks.air },
    { icon: "⚙️",  title: "Transmission Fluid",  dueMi: lastTransMiles  + schedule.trans_interval_mi,        risk: risks.trans },
    { icon: "❄️",  title: "Coolant",             dueMi: lastCoolantMiles + schedule.coolant_interval_mi,     risk: risks.coolant },
  ];

  const recs = items
    .map(x => ({
      icon: x.icon,
      title: x.title,
      status: currentMiles >= x.dueMi ? (x.title === "Coolant" ? "Likely Due" : "Overdue") : "Due Soon",
      next: `${x.dueMi.toLocaleString()} mi (~${etaByMiles(currentMiles, x.dueMi, mpd)})`,
      risk: x.risk,
      priority: currentMiles >= x.dueMi ? 1 : 2,
    }))
    .sort((a, b) => a.priority - b.priority);

  // Prefer ingested DVI; otherwise a small placeholder set
  const dvi = getDvi();
  const flags =
    (dvi?.findings?.length ? dvi.findings : [
      { status: "red",    label: "Lower Fluid Leaks", notes: "Oil pan drain plug + CCV gasket leaking" },
      { status: "yellow", label: "Air Filter",        notes: "Dirty, recommend next service" },
      { status: "red",    label: "DEF/Reductant Pump", notes: "Pump tip broken, pressure low" },
    ]).filter(f => ["red","yellow"].includes(f.status));

  return Response.json({ mpd, recs, flags, vin });
}
