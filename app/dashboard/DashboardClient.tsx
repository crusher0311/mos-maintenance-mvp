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
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Modern Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/20 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Dashboard
                </h1>
                <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                  <span>📧 {data.user.email}</span>
                  <span>👤 {data.user.role}</span>
                  <span>🏪 Shop {String(data.user.shopId ?? "—")}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={refreshData}
                disabled={isRefreshing}
                className="flex items-center space-x-2 px-4 py-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 shadow-sm"
                title="Refresh data"
              >
                <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm font-medium">
                  {isRefreshing ? "Refreshing..." : "Refresh Now"}
                </span>
              </button>
              
              <div className="text-right text-xs text-gray-500">
                <div>🕐 {lastUpdated.toLocaleTimeString()}</div>
                <div className="text-green-600 mt-1">● Auto-refresh: 30s</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Statistics Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-white/20 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Vehicles</p>
                <p className="text-2xl font-bold text-gray-900">{data.rows.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-white/20 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">DVI Complete</p>
                <p className="text-2xl font-bold text-gray-900">{data.rows.filter(r => r.dviDone).length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-white/20 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">In Progress</p>
                <p className="text-2xl font-bold text-gray-900">{data.rows.filter(r => !r.dviDone).length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-white/20 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Today's Avg</p>
                <p className="text-2xl font-bold text-gray-900">2.3m</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Table Section */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-white/20 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200/50">
            <h2 className="text-lg font-semibold text-gray-900">Recent Vehicles / Customers</h2>
            <p className="text-sm text-gray-600 mt-1">({data.rows.length} active vehicles)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 text-left">
                <tr>
                  <th className="p-4 font-semibold text-gray-700 w-12">{/* X */}</th>
                  <th className="p-4 font-semibold text-gray-700">Name</th>
                  <th className="p-4 font-semibold text-gray-700">RO #</th>
                  <th className="p-4 font-semibold text-gray-700">Vehicle</th>
                  <th className="p-4 font-semibold text-gray-700">VIN</th>
                  <th className="p-4 font-semibold text-gray-700">AF Status</th>
                  <th className="p-4 font-semibold text-gray-700">DVI</th>
                  <th className="p-4 font-semibold text-gray-700">Odometer</th>
                  <th className="p-4 font-semibold text-gray-700">Updated</th>
                  <th className="p-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50">
              {data.rows.map((r: any) => {
                const vin = r.displayVin || "";
                const statusText = r.af?.status || "Unknown";
                const badge = badgeClassFromStatus(statusText);

                return (
                  <tr key={vin} className="hover:bg-blue-50/50 transition-colors duration-150">
                    {/* Manual Close (left X) — dashboard redirect */}
                    <td className="p-4 align-middle">
                      <form
                        method="post"
                        action={`/api/vehicle/close/${encodeURIComponent(vin)}?redirect=/dashboard`}
                      >
                        <button
                          aria-label="Manual Close"
                          title="Manual Close"
                          className="w-8 h-8 rounded-full border border-gray-300 hover:border-red-400 hover:bg-red-50 hover:text-red-600 transition-all duration-150 flex items-center justify-center text-gray-400"
                        >
                          ×
                        </button>
                      </form>
                    </td>

                    {/* Name (links to vehicle page) */}
                    <td className="p-4">
                      <a className="text-blue-600 hover:text-blue-800 font-medium hover:underline transition-colors" href={VEHICLE_HREF(vin)}>
                        {r.displayName || "—"}
                      </a>
                    </td>

                    {/* RO # */}
                    <td className="p-4">
                      {r.displayRo ? (
                        <code className="bg-gray-100 px-2 py-1 rounded-md text-xs font-mono">{r.displayRo}</code>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Vehicle */}
                    <td className="p-4 font-medium text-gray-700">
                      {r.displayVehicle && r.displayVehicle.trim() !== "" ? r.displayVehicle : "—"}
                    </td>

                    {/* VIN */}
                    <td className="p-4">
                      <a className="text-blue-600 hover:text-blue-800 hover:underline transition-colors" href={VEHICLE_HREF(vin)}>
                        <code className="bg-blue-50 border border-blue-200 px-2 py-1 rounded-md text-xs font-mono">{vin}</code>
                      </a>
                    </td>

                    {/* AF Status */}
                    <td className="p-4">
                      <div className="space-y-1">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badge}`}>
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
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center">
                        {r.dviDone ? (
                          <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Miles */}
                    <td className="p-4 font-mono text-sm">
                      {r.displayMiles != null
                        ? (Number(r.displayMiles).toLocaleString?.() ?? r.displayMiles)
                        : "—"}
                    </td>

                    {/* Updated */}
                    <td className="p-4">
                      {r.updatedAt ? (
                        <div className="text-xs">
                          <div className="font-medium">{new Date(r.updatedAt).toLocaleDateString()}</div>
                          <div className="text-gray-500">{new Date(r.updatedAt).toLocaleTimeString()}</div>
                        </div>
                      ) : r.af?.createdAt ? (
                        <div className="text-xs">
                          <div className="font-medium">{new Date(r.af.createdAt).toLocaleDateString()}</div>
                          <div className="text-gray-500">{new Date(r.af.createdAt).toLocaleTimeString()}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400" title={`Debug: updatedAt=${r.updatedAt}, af.createdAt=${r.af?.createdAt}`}>—</span>
                      )}
                    </td>

                    {/* Inspect / Plan / Recommended */}
                    <td className="p-4">
                      <div className="flex gap-2">
                        <a
                          href={VEHICLE_HREF(vin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-xs font-medium"
                          title="Open vehicle page"
                        >
                          Inspect
                        </a>
                        <a
                          href={PLAN_HREF(vin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-xs font-medium"
                          title="Open maintenance plan"
                        >
                          Plan
                        </a>
                        <a
                          href={RECOMMENDED_HREF(vin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-xs font-medium"
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
                  <td className="p-12 text-center" colSpan={10}>
                    <div className="flex flex-col items-center space-y-4">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles to display</h3>
                        <p className="text-gray-500">No open customers with vehicle info to display.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Info */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-white/20 shadow-sm p-6 mt-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-xs text-gray-500 space-y-2 md:space-y-0">
            <p className="max-w-2xl">
              AF Status (and mileage, when available) come from the latest AutoFlow event's{" "}
              <code className="bg-gray-100 px-1 rounded">payload.ticket.status</code>/{" "}
              <code className="bg-gray-100 px-1 rounded">payload.ticket.mileage</code> (with fallbacks to other fields).
              Miles fall back to other payload odometer fields. "Appointment" items are hidden here until they progress.
            </p>
            <div className="text-right">
              <div className="text-green-600 font-medium">● Auto-refreshes every 30 seconds</div>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <div className="text-center mt-8">
          <form action="/api/auth/logout" method="post">
            <button className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-colors text-sm font-medium shadow-sm">
              Log out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}