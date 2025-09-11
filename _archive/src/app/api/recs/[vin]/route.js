// src/app/api/recs/[vin]/route.js
import { dbConnect } from "@/lib/db";
import { OdometerPoint, InspectionFinding } from "@/lib/models";

function milesPerDay(points) {
  if (!points || points.length < 2) return 30;
  const a = points[points.length - 2], b = points[points.length - 1];
  const days = (b.date - a.date) / 86400000;
  const miles = b.miles - a.miles;
  return Math.max(0, Math.round((miles / Math.max(days, 1)) * 10) / 10);
}
function etaByMiles(current, target, mpd) {
  const d = new Date();
  const days = Math.ceil(Math.max(0, target - current) / Math.max(mpd, 1));
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString();
}

export async function GET(req, context) {
  const { vin } = await context.params;
  const url = new URL(req.url);
  const currentMiles = Number(url.searchParams.get("mileage") || 103265);

  await dbConnect();

  // Pull odometer points for this VIN (sorted ascending)
  const odo = await OdometerPoint.find({ vin }).sort({ date: 1, miles: 1 }).limit(20).lean();
  // Fallback if none yet
  const points = odo.length
    ? odo.map(p => ({ date: new Date(p.date), miles: p.miles }))
    : [
        { date: new Date("2024-09-19"), miles: 94615 },
        { date: new Date("2025-01-29"), miles: 95150 },
        { date: new Date("2025-08-21"), miles: 103265 },
      ];

  const mpd = milesPerDay(points);

  // Severe schedule (static for now; later fetch by VIN/engine)
  const schedule = {
    oil_interval_mi: 7500,
    fuel_filter_interval_mi: 15000,
    air_filter_interval_mi: 15000,
    trans_interval_mi: 60000,
    coolant_interval_mi: 60000,
  };

  // Last-known service mileages (from earlier analysis; later persist these)
  const lastOilMiles = 94615;
  const lastFuelMiles = 85879;
  const lastAirMiles = 82648;
  const lastTransMiles = 49218;
  const lastCoolantMiles = 80750;

  const risks = {
    oil: "Engine wear, sludge, turbo damage",
    fuel: "Hard starts, injector failure ($$$)",
    air: "Poor mileage, engine strain, black smoke",
    trans: "Harsh shifts, overheating, failure",
    coolant: "Overheating, head gasket leaks",
  };

  const items = [
    { icon: "ðŸ›¢ï¸", title: "Oil & Filter",        dueMi: lastOilMiles    + schedule.oil_interval_mi,        risk: risks.oil },
    { icon: "â›½",  title: "Fuel Filter",         dueMi: lastFuelMiles   + schedule.fuel_filter_interval_mi, risk: risks.fuel },
    { icon: "ðŸŒ¬ï¸", title: "Air Filter",          dueMi: lastAirMiles    + schedule.air_filter_interval_mi,  risk: risks.air },
    { icon: "âš™ï¸",  title: "Transmission Fluid",  dueMi: lastTransMiles  + schedule.trans_interval_mi,       risk: risks.trans },
    { icon: "â„ï¸",  title: "Coolant",             dueMi: lastCoolantMiles + schedule.coolant_interval_mi,    risk: risks.coolant },
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

  // Read latest red/yellow findings from DB
  const findings = await InspectionFinding
    .find({ vin, status: { $in: ["red","yellow"] } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const flags = findings.map(f => ({
    label: f.label,
    status: f.status,
    notes: f.notes || "",
  }));

  return Response.json({ mpd, recs, flags, vin });
}

