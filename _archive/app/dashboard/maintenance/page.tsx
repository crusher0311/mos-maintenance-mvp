// /app/dashboard/maintenance/page.tsx
import React from "react";
import { getMongo } from "../../lib/mongo";

export const dynamic = "force-dynamic";

type Row = {
  vin: string;
  shopId?: string | null;
  updatedAt: string | Date | number;
  counters?: Record<string, number>;
  result?: {
    make?: string;
    model?: string;
    year?: string | number;
    analysis?: {
      maintenance_comparison?: {
        items?: { service: string; status: string }[];
        warnings?: string[];
      };
    };
    error?: string;
  };
};

export default async function Page() {
  const client = await getMongo();
  const db = client.db(process.env.MONGODB_DB || process.env.DB_NAME || "mos-maintenance-mvp");

  const docs = (await db
    .collection("vehicleschedules")
    .find({}, { projection: { _id: 0 } })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray()) as unknown as Row[];

  const totals = docs.reduce((acc, r) => {
    const c = r.counters || {};
    for (const k of Object.keys(c)) acc[k] = (acc[k] || 0) + (c[k] || 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Maintenance Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {["overdue", "due", "coming_soon", "not_yet"].map((k) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase text-slate-500">{k.replace("_", " ")}</div>
            <div className="text-2xl font-semibold">{totals[k] || 0}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">VIN</th>
              <th className="px-3 py-2 text-left">Vehicle</th>
              <th className="px-3 py-2 text-left">Shop</th>
              <th className="px-3 py-2 text-left">Counts</th>
              <th className="px-3 py-2 text-left">Updated</th>
              <th className="px-3 py-2 text-left">Open</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((r) => {
              const veh = r.result || {};
              const vehicle = [veh?.year, veh?.make, veh?.model].filter(Boolean).join(" ") || "â€”";
              const counts = r.counters || {};
              const dt =
                typeof r.updatedAt === "number"
                  ? new Date(r.updatedAt)
                  : typeof r.updatedAt === "string"
                  ? new Date(r.updatedAt)
                  : (r.updatedAt as Date);
              const updated = dt.toLocaleString();

              const badge = (label: string) => (
                <span
                  key={label}
                  className="inline-block rounded-full bg-slate-100 text-slate-800 text-xs px-2 py-0.5 mr-1"
                >
                  {label.replace("_", " ")}: {counts[label] || 0}
                </span>
              );

              return (
                <tr key={`${r.vin}-${r.shopId || "null"}`} className="border-t">
                  <td className="px-3 py-2 font-mono">{r.vin}</td>
                  <td className="px-3 py-2">{vehicle}</td>
                  <td className="px-3 py-2">{r.shopId || "â€”"}</td>
                  <td className="px-3 py-2">
                    {["overdue", "due", "coming_soon", "not_yet"].map((k) => badge(k))}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{updated}</td>
                  <td className="px-3 py-2">
                    <a
                      className="text-xs rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-100"
                      href={`/vehicle/${encodeURIComponent(r.vin)}`}
                      target="_blank"
                    >
                      View
                    </a>
                  </td>
                </tr>
              );
            })}
            {docs.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-slate-600" colSpan={6}>
                  No rows yet. POST to <code className="font-mono">/api/maintenance/run-batch</code> to populate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">
        Reading from <code className="font-mono">vehicleschedules</code>. Rows updated by the batch
        route using your analyzer endpoint.
      </div>
    </div>
  );
}

