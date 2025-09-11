// src/components/MaintenancePanel.tsx
"use client";

import * as React from "react";

type Interval = {
  interval_id: number;
  type: string;              // e.g., "Every"
  value: number;             // e.g., 7500 or 6
  units: "Miles" | "Months"; // DataOne uses these two
  initial_value: number | null;
};

type MaintenanceItem = {
  maintenance_id: number;
  name: string;
  category: string;
  notes: string | null;
  miles: number | null;
  months: number | null;
  intervals: Interval[];
};

type ApiResponse = {
  vin: string;
  squish: string;
  count: number;
  items: MaintenanceItem[];
};

export default function MaintenancePanel({ vin }: { vin: string }) {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rawOpen, setRawOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    fetch(`/api/maintenance/${encodeURIComponent(vin)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error || `Request failed (${r.status})`);
        }
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [vin]);

  return (
    <div className="mt-10">
      <h2 className="text-xl font-semibold mb-3">OEM Services</h2>

      {!data && !error && (
        <div className="text-sm text-gray-500">Loading OEM services…</div>
      )}

      {error && (
        <div className="text-sm text-red-600">
          Failed to load OEM services: {error}
        </div>
      )}

      {data && (
        <>
          {data.count === 0 ? (
            <div className="text-sm text-gray-600">
              No OEM services found for VIN {data.vin}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Service</th>
                    <th className="px-3 py-2 font-medium">Miles</th>
                    <th className="px-3 py-2 font-medium">Months</th>
                    <th className="px-3 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={it.maintenance_id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {it.category || "—"}
                      </td>
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2">{it.miles ?? "—"}</td>
                      <td className="px-3 py-2">{it.months ?? "—"}</td>
                      <td className="px-3 py-2">
                        {it.notes ? it.notes : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            className="mt-3 text-xs underline text-gray-600"
            onClick={() => setRawOpen((x) => !x)}
          >
            {rawOpen ? "Hide raw JSON" : "Show raw JSON"}
          </button>
          {rawOpen && (
            <pre className="mt-2 max-h-80 overflow-auto text-xs bg-gray-50 p-3 rounded border">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
