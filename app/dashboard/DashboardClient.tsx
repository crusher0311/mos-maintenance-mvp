"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DashboardData = {
  rows: any[];
  user: any;
};

export default function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      await refreshData();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  const refreshData = async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch('/api/dashboard/data', {
        cache: 'no-store'
      });
      
      if (response.ok) {
        const newData = await response.json();
        setData(newData);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to refresh dashboard data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const VEHICLE_HREF = (vin: string) => `/dashboard/vehicles/${encodeURIComponent(vin)}`;
  const PLAN_HREF = (vin: string) => `/dashboard/vehicles/${encodeURIComponent(vin)}/plan`;
  const RECOMMENDED_HREF = (vin: string) => `/dashboard/recommended?vin=${encodeURIComponent(vin)}`;

  function badgeClassFromStatus(s?: string) {
    const t = (s || "").toLowerCase();
    if (!t) return "bg-gray-100 text-gray-800";
    if (t.includes("close")) return "bg-green-100 text-green-800";
    if (t.includes("open")) return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-800";
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="space-y-1">
        <div className="flex justify-between items-start">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="text-right">
            <button
              onClick={refreshData}
              disabled={isRefreshing}
              className="mb-2 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Refresh Now"}
            </button>
            <div className="text-xs text-gray-500">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
          </div>
        </div>
        <div className="space-y-1 text-sm">
          <div>Email: <code>{data.user.email}</code></div>
          <div>Role: <code>{data.user.role}</code></div>
          <div>Shop ID: <code>{String(data.user.shopId ?? "—")}</code></div>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Recent Vehicles / Customers 
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({data.rows.length} active vehicles)
          </span>
        </h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3 w-10">{/* X */}</th>
                <th className="p-3">Name</th>
                <th className="p-3">RO #</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">VIN</th>
                <th className="p-3">AF Status</th>
                <th className="p-3">DVI</th>
                <th className="p-3">Odometer</th>
                <th className="p-3">Updated</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => {
                const vin = r.displayVin || "";
                const statusText = r.af?.status || "Unknown";
                const badge = badgeClassFromStatus(statusText);

                return (
                  <tr key={vin} className="border-t hover:bg-gray-50">
                    {/* Manual Close (left X) — dashboard redirect */}
                    <td className="p-3 align-middle">
                      <form
                        method="post"
                        action={`/api/vehicle/close/${encodeURIComponent(vin)}?redirect=/dashboard`}
                      >
                        <button
                          aria-label="Manual Close"
                          title="Manual Close"
                          className="rounded-full border w-6 h-6 leading-5 text-center hover:bg-gray-100"
                        >
                          ×
                        </button>
                      </form>
                    </td>

                    {/* Name (links to vehicle page) */}
                    <td className="p-3">
                      <a className="text-blue-600 hover:underline" href={VEHICLE_HREF(vin)}>
                        {r.displayName || "—"}
                      </a>
                    </td>

                    {/* RO # */}
                    <td className="p-3">
                      {r.displayRo ? (
                        <code className="bg-gray-100 px-1 rounded">{r.displayRo}</code>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Vehicle */}
                    <td className="p-3">
                      {r.displayVehicle && r.displayVehicle.trim() !== "" ? r.displayVehicle : "—"}
                    </td>

                    {/* VIN */}
                    <td className="p-3">
                      <a className="text-blue-600 hover:underline" href={VEHICLE_HREF(vin)}>
                        <code className="bg-gray-100 px-1 rounded">{vin}</code>
                      </a>
                    </td>

                    {/* AF Status */}
                    <td className="p-3">
                      <div className="space-y-1">
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${badge}`}>
                          {statusText}
                        </span>
                        {r.af?.createdAt ? (
                          <div className="text-xs text-gray-500">
                            {new Date(r.af.createdAt).toLocaleString()}
                          </div>
                        ) : null}
                      </div>
                    </td>

                    {/* DVI */}
                    <td className="p-3">{r.dviDone ? "✅" : "⏹️"}</td>

                    {/* Miles */}
                    <td className="p-3">
                      {r.displayMiles != null
                        ? (Number(r.displayMiles).toLocaleString?.() ?? r.displayMiles)
                        : "—"}
                    </td>

                    {/* Updated */}
                    <td className="p-3">
                      {r.updatedAt ? (
                        <div className="text-xs">
                          <div>{new Date(r.updatedAt).toLocaleDateString()}</div>
                          <div className="text-gray-500">{new Date(r.updatedAt).toLocaleTimeString()}</div>
                        </div>
                      ) : r.af?.createdAt ? (
                        <div className="text-xs">
                          <div>{new Date(r.af.createdAt).toLocaleDateString()}</div>
                          <div className="text-gray-500">{new Date(r.af.createdAt).toLocaleTimeString()}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400" title={`Debug: updatedAt=${r.updatedAt}, af.createdAt=${r.af?.createdAt}`}>—</span>
                      )}
                    </td>

                    {/* Inspect / Plan / Recommended */}
                    <td className="p-3">
                      <div className="flex gap-2">
                        <a
                          href={VEHICLE_HREF(vin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border px-2 py-1 hover:bg-gray-100 text-xs"
                          title="Open vehicle page"
                        >
                          Inspect
                        </a>
                        <a
                          href={PLAN_HREF(vin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border px-2 py-1 hover:bg-gray-100 text-xs"
                          title="Open maintenance plan"
                        >
                          Plan
                        </a>
                        <a
                          href={RECOMMENDED_HREF(vin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border px-2 py-1 hover:bg-gray-100 text-xs"
                          title="Open AI recommendations"
                        >
                          Recommended
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data.rows.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-gray-500" colSpan={10}>
                    No open customers with vehicle info to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center text-xs text-gray-500">
          <p>
            AF Status (and mileage, when available) come from the latest AutoFlow event's{" "}
            <code>payload.ticket.status</code>/<code>payload.ticket.mileage</code> (with fallbacks to other fields).
            Miles fall back to other payload odometer fields. "Appointment" items are hidden here until they progress.
          </p>
          <div className="text-right">
            Auto-refreshes every 30 seconds
          </div>
        </div>
      </section>

      <form action="/api/auth/logout" method="post">
        <button className="rounded bg-black text-white px-4 py-2">Log out</button>
      </form>
    </main>
  );
}