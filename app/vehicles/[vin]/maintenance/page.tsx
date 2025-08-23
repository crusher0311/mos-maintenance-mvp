// /app/vehicles/[vin]/maintenance/page.tsx
import React from "react";
import { headers } from "next/headers";

/**
 * Server Component page that:
 * - Awaits params (Next 15)
 * - Calls the analyze API with an absolute URL (POST, no-store)
 * - Shows grouped results with Tailwind
 * - Includes a "Refresh" control without client JS (adds a cache-busting query)
 */

type AnalysisItem = {
  service: string;
  status: "overdue" | "due" | "coming_soon" | "not_yet" | string;
};
type AnalysisResponse = {
  vin: string;
  make?: string;
  model?: string;
  year?: string | number;
  miles_per_day_used?: number;
  analysis?: {
    maintenance_comparison?: {
      items?: AnalysisItem[];
      warnings?: string[]; // API may add warnings when falling back
      source_notes?: string[]; // optional provenance notes
    };
  };
  error?: string;
};

function statusStyle(s: string) {
  switch (s) {
    case "overdue":
      return "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200";
    case "due":
      return "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200";
    case "coming_soon":
      return "bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-200";
    case "not_yet":
      return "bg-gray-100 text-gray-800 ring-1 ring-inset ring-gray-200";
    default:
      return "bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-200";
  }
}

function StatusBadge({ s }: { s: string }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusStyle(s)}`}>
      {s.replace("_", " ")}
    </span>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ vin: string }>;
}) {
  const { vin } = await params;

  // Absolute URL for server->server fetch
  const hdrs = await headers();
  const host = hdrs.get("host") || "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const apiUrl = `${protocol}://${host}/api/maintenance/analyze/${vin}`;

  // Make the request
  let data: AnalysisResponse;
  try {
    const res = await fetch(apiUrl, {
      cache: "no-store",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}", // zod-safe empty object
    });
    const json = (await res.json()) as AnalysisResponse;
    if (!res.ok || json?.error) {
      data = { vin, error: json?.error || `API error ${res.status}` };
    } else {
      data = json;
    }
  } catch (e: any) {
    data = { vin, error: `Failed to fetch analysis: ${e?.message || String(e)}` };
  }

  const items = data.analysis?.maintenance_comparison?.items || [];
  const byStatus = items.reduce<Record<string, AnalysisItem[]>>((acc, it) => {
    (acc[it.status] ||= []).push(it);
    return acc;
  }, {});
  const order = ["overdue", "due", "coming_soon", "not_yet"];
  const orderedGroups = [
    ...order.filter((k) => byStatus[k]?.length),
    ...Object.keys(byStatus).filter((k) => !order.includes(k)),
  ];

  // Cache-busting refresh URL (no client JS needed)
  const now = Date.now();
  const refreshUrl = (suffix = "") =>
    `${protocol}://${host}/vehicles/${encodeURIComponent(vin)}/maintenance${suffix ? `?${suffix}` : ""}`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {data.year ? `${data.year} ` : ""}
            {data.make || "Vehicle"} {data.model ? ` ${data.model}` : ""}
          </h1>
          <p className="text-sm text-slate-600">VIN: {data.vin}</p>
          {typeof data.miles_per_day_used === "number" && (
            <p className="text-sm text-slate-600 mt-1">
              Estimated miles per day:{" "}
              <span className="font-medium">{data.miles_per_day_used.toFixed(2)}</span>
            </p>
          )}
        </div>

        <div className="text-right space-y-2">
          <div className="text-xs text-slate-500">Status legend</div>
          <div className="flex gap-2 flex-wrap justify-end">
            <StatusBadge s="overdue" />
            <StatusBadge s="due" />
            <StatusBadge s="coming_soon" />
            <StatusBadge s="not_yet" />
          </div>
          <div className="pt-2">
            <a
              href={refreshUrl(`r=${now}`)}
              className="text-xs rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Refresh
            </a>
          </div>
        </div>
      </div>

      {/* Warnings from API (e.g., VD fallback) */}
      {!!data.analysis?.maintenance_comparison?.warnings?.length && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium mb-1">Notes</div>
          <ul className="list-disc pl-5 space-y-1">
            {data.analysis?.maintenance_comparison?.warnings?.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Error */}
      {data.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-medium">Analysis error</div>
          <div>{data.error}</div>
          <div className="mt-2">
            <a
              href={refreshUrl(`r=${now}`)}
              className="text-xs rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Try again
            </a>
          </div>
        </div>
      )}

      {/* Empty */}
      {!data.error && items.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-slate-700">
            No maintenance items returned. Try another VIN or check your API logs.
          </div>
        </div>
      )}

      {/* Groups */}
      {orderedGroups.map((group) => (
        <section key={group} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold capitalize">{group.replace("_", " ")}</h2>
            <StatusBadge s={group} />
            <span className="text-xs text-slate-500">
              ({byStatus[group].length})
            </span>
          </div>

          <ul className="grid md:grid-cols-2 gap-3">
            {byStatus[group].map((it, idx) => (
              <li
                key={`${group}-${idx}`}
                className="rounded-xl border border-slate-200 bg-white p-4 flex items-start justify-between"
              >
                <div className="pr-4">
                  <div className="font-medium text-slate-900">{it.service}</div>
                </div>
                <StatusBadge s={it.status} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="text-xs text-slate-500 pt-6">
        This page calls <code className="font-mono">/api/maintenance/analyze/[vin]</code> via{" "}
        <code>POST</code> with <code>cache: "no-store"</code>. Use{" "}
        <code>?r=timestamp</code> to bust any intermediary caches when testing.
      </div>
    </div>
  );
}
