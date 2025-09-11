"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Printer,
  Droplets,
  Fuel,
  Wind,
  Cog,
  Snowflake,
} from "lucide-react";

/**
 * MOS Maintenance MVP (JS) – Advisor + Customer Views
 * - No external UI libs; simple inline components
 * - Lucide icons (no emojis) to avoid encoding issues
 */

// ------------------ SIMPLE UI PRIMITIVES ------------------
function Card({ children }) {
  return <div className="rounded-2xl shadow border border-gray-200 bg-white">{children}</div>;
}
function CardContent({ children, className = "" }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
function Button({ children, variant = "default", className = "", ...props }) {
  const base = "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium";
  const styles = variant === "outline"
    ? "border border-gray-300 bg-white hover:bg-gray-50"
    : "bg-gray-900 text-white hover:bg-gray-800";
  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

// ------------------ API HELPERS ------------------
async function apiGet(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}

// ------------------ CORE LOGIC ------------------
function milesPerDayFromHistory(points) {
  if (!points?.length || points.length < 2) return 30;
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const days = (new Date(b.date) - new Date(a.date)) / 86400000;
  const miles = b.odo - a.odo;
  return Math.max(0, Math.round((miles / Math.max(days, 1)) * 10) / 10);
}
function projectDateByMiles(currentMiles, targetMiles, milesPerDay) {
  const remaining = Math.max(0, targetMiles - currentMiles);
  const days = remaining / Math.max(milesPerDay, 1);
  const d = new Date();
  d.setDate(d.getDate() + Math.ceil(days));
  return d.toLocaleDateString();
}

const ICON_MAP = {
  oil: Droplets,
  fuel: Fuel,
  air: Wind,
  trans: Cog,
  coolant: Snowflake,
};

function buildRecommendations({ currentMiles, carfax, schedule }) {
  const mpd = milesPerDayFromHistory(carfax.points);
  const risks = {
    oil: "Engine wear, sludge, turbo damage",
    fuel: "Hard starts, injector failure ($$$)",
    air: "Poor mileage, engine strain, black smoke",
    trans: "Harsh shifts, overheating, failure",
    coolant: "Overheating, head gasket leaks",
  };

  // Last-known mileages (from your earlier data)
  const lastOilMiles = 94615;
  const lastFuelMiles = 85879;
  const lastAirMiles = 82648;
  const lastTransMiles = 49218;
  const lastCoolantMiles = 80750;

  const items = [
    { key: "oil",     title: "Oil & Filter",        dueMi: lastOilMiles + schedule.oil_interval_mi,        risk: risks.oil     },
    { key: "fuel",    title: "Fuel Filter",         dueMi: lastFuelMiles + schedule.fuel_filter_interval_mi, risk: risks.fuel   },
    { key: "air",     title: "Air Filter",          dueMi: lastAirMiles + schedule.air_filter_interval_mi,  risk: risks.air     },
    { key: "trans",   title: "Transmission Fluid",  dueMi: lastTransMiles + schedule.trans_interval_mi,     risk: risks.trans   },
    { key: "coolant", title: "Coolant",             dueMi: lastCoolantMiles + schedule.coolant_interval_mi, risk: risks.coolant },
  ];

  const recs = items.map(x => ({
    key: x.key,
    title: x.title,
    status: currentMiles >= x.dueMi ? (x.key === "coolant" ? "Likely Due" : "Overdue") : "Due Soon",
    next: `${x.dueMi.toLocaleString()} mi (~${projectDateByMiles(currentMiles, x.dueMi, mpd)})`,
    risk: x.risk,
    priority: currentMiles >= x.dueMi ? 1 : 2,
  })).sort((a, b) => a.priority - b.priority);

  return { mpd, recs };
}

// ------------------ CUSTOMER VIEW ------------------
function CustomerReport({ data, currentMiles }) {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">Your Maintenance Plan</h2>
      <p className="text-gray-700 text-sm">
        Current mileage: {currentMiles.toLocaleString()} · Driving ~{data.mpd} miles/day
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {data.recs.map((r, i) => {
          const Icon = ICON_MAP[r.key] || Droplets;
          return (
            <Card key={i}>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <Icon className="h-6 w-6 text-gray-700" />
                  <span className="text-sm font-semibold">{r.status}</span>
                </div>
                <div className="font-semibold">{r.title}</div>
                <div className="text-sm text-gray-700">Next: {r.next}</div>
                <div className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> If delayed: {r.risk}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Print / Save PDF
        </Button>
      </div>
    </div>
  );
}

// ------------------ ADVISOR VIEW ------------------
function AdvisorReport({ data, currentMiles }) {
  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">MOS Maintenance – Advisor View (MVP)</h1>
        <p className="text-gray-600">2011 Ford F-350 · {currentMiles.toLocaleString()} mi · ~{data.mpd} mi/day</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {data.recs.map((s, i) => {
          const Icon = ICON_MAP[s.key] || Droplets;
          return (
            <Card key={i}>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Icon className="h-6 w-6 text-gray-700" />
                  <span className={`text-sm font-semibold ${s.status.match(/Overdue|Due/) ? "text-red-600" : "text-green-600"}`}>{s.status}</span>
                </div>
                <h2 className="text-lg font-bold">{s.title}</h2>
                <p className="text-sm text-gray-700">Next: {s.next}</p>
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4" /> {s.risk}
                </div>
                <Button variant="outline" className="w-full">
                  <CalendarDays className="h-4 w-4 mr-2" /> Schedule Service
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Customer Commitment Line (legally safe)</h3>
        <p className="text-sm text-gray-700">
          “Following this plan is designed to reduce the risk of breakdowns and unexpected costs.
          We cannot prevent every failure, but we’ll help you minimize them.”
        </p>
      </section>
    </div>
  );
}

function Timeline({ vin, refreshToken }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/timeline/${vin}?limit=20`, { cache: "no-store" });
      const data = await res.json();
      setEvents(data.events || []);
    })();
    // re-run when refreshToken changes
  }, [vin, refreshToken]);

  return (
    <div className="p-6 space-y-3">
      <h3 className="text-lg font-bold">Service Timeline</h3>
      <ul className="space-y-2">
        {events.map((e, i) => (
          <li key={i} className="text-sm border rounded-lg p-3">
            <div className="font-semibold">{e.type}</div>
            <div className="text-gray-700">
              {new Date(e.date).toLocaleString()} · {e.mileage ? `${e.mileage.toLocaleString()} mi` : "no mileage"}
              {e.visitId ? ` · Visit: ${e.visitId}` : ""}
            </div>
          </li>
        ))}
        {events.length === 0 && <li className="text-sm text-gray-500">No events yet.</li>}
      </ul>
    </div>
  );
}

// ------------------ SHELL COMPONENT ------------------
export default function MOSMaintenanceMVP() {
  const VIN = "1FT8W3BT0BEA08647";
  const [currentMiles] = useState(103265);
  const [data, setData] = useState(null);
  const [view, setView] = useState("advisor"); // "advisor" | "customer"
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    (async () => {
      const result = await apiGet(`/api/recs/${VIN}?mileage=${currentMiles}`);
      setData(result);
    })();
  }, [currentMiles]);

  if (!data) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <Button variant={view === "advisor" ? "default" : "outline"} onClick={() => setView("advisor")}>Advisor View</Button>
        <Button variant={view === "customer" ? "default" : "outline"} onClick={() => setView("customer")}>Customer View</Button>
        {/* Backfill button removed */}
        <Button variant="outline" onClick={() => setRefreshToken((x) => x + 1)}>Refresh Timeline</Button>
      </div>

      {view === "advisor"
        ? <AdvisorReport data={data} currentMiles={currentMiles} />
        : <CustomerReport data={data} currentMiles={currentMiles} />}

      <Timeline vin={VIN} refreshToken={refreshToken} />
    </div>
  );
}
