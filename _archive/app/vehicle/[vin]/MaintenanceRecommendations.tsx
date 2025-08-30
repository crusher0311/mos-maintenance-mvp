// app/vehicle/[vin]/MaintenanceRecommendations.tsx
import React from "react";

type Item = { service: string; status: "overdue" | "due" | "not_yet" };
type AnalyzeResponse = {
  vin: string;
  analysis?: { maintenance_comparison?: { items?: Item[]; source_notes?: string[] } };
  counts?: Record<string, number>;
};

function badge(status: Item["status"]) {
  const map: Record<Item["status"], string> = {
    overdue: "bg-red-600 text-white",
    due: "bg-amber-500 text-black",
    not_yet: "bg-slate-600 text-white",
  };
  return map[status] || "bg-slate-600 text-white";
}

export default async function MaintenanceRecommendations({
  vin,
  year,
  make,
  model,
  odometer,
  horizonMiles = 0,
  horizonMonths = 0,
  showNotYet = false,
}: {
  vin: string;
  year: number;
  make: string;
  model: string;
  odometer: number;
  horizonMiles?: number;
  horizonMonths?: number;
  showNotYet?: boolean;
}) {
  const params = new URLSearchParams({
    odometer: String(odometer ?? ""),
    schedule: "normal",
    horizonMiles: String(horizonMiles),
    horizonMonths: String(horizonMonths),
    year: String(year),
    make,
    model,
  });

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/maintenance/analyze/${vin}?${params.toString()}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    return (
      <div className="text-red-400">
        Failed to load analysis: {res.status} {res.statusText}
      </div>
    );
  }

  const data: AnalyzeResponse = await res.json();
  const items = data.analysis?.maintenance_comparison?.items ?? [];

  const filtered = items.filter((i) =>
    showNotYet ? true : i.status === "overdue" || i.status === "due"
  );

  if (!filtered.length) {
    return (
      <div className="text-slate-300">
        No recommendations yet. Try increasing the horizon, or verify odometer/months.
      </div>
    );
  }

  return (
    <div className="mt-4">
      <table className="w-full border border-slate-700 text-slate-100 text-sm">
        <thead className="bg-slate-800">
          <tr>
            <th className="text-left p-2 border-b border-slate-700">Service</th>
            <th className="text-left p-2 border-b border-slate-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((i, idx) => (
            <tr key={idx} className="odd:bg-slate-900">
              <td className="p-2 border-b border-slate-800">{i.service}</td>
              <td className="p-2 border-b border-slate-800">
                <span className={`px-2 py-1 rounded ${badge(i.status)}`}>{i.status.toUpperCase()}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!!data.counts && (
        <div className="mt-2 text-xs text-slate-400">
          Counts: {Object.entries(data.counts).map(([k, v]) => `${k}=${v}`).join(" · ")}
        </div>
      )}
    </div>
  );
}
