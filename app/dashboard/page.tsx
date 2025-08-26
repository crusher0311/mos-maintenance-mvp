"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/* ---------- Types mirrored from /api/dashboard ---------- */
type Counts = { overdue: number; comingSoon: number; notYet: number };

type Row = {
  vin: string;
  vehicleTitle: string;
  shop?: string | null;
  counts: Counts;
  updated?: string | null;
};

type DashboardPayload = {
  rows: Row[];
  totals: Counts;
  __debug?: Record<string, any>;
};

/* ---------- Utils ---------- */
const AUTO_REFRESH_MS = 30_000;

function fmtRelative(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (sec < 45) return `${sec}s ago`;
  if (min < 90) return `${min}m ago`;
  if (hr < 36) return `${hr}h ago`;
  return d.toLocaleString();
}

function Badge({
  children,
  tone = "muted" as "muted" | "red" | "yellow" | "green",
}) {
  const map = {
    muted: "bg-[#0e1622] text-[--color-muted] border-line",
    red: "bg-[#2a1010] text-[--color-bad] border-[--color-bad]/40",
    yellow: "bg-[#2b260e] text-[--color-soon] border-[--color-soon]/40",
    green: "bg-[#0f1f14] text-[--color-good] border-[--color-good]/40",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${map[tone]}`}>
      {children}
    </span>
  );
}

/* ---------- Page ---------- */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      setErr(null);
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload: DashboardPayload = await res.json();
      setData(payload);
      setLastFetch(Date.now());
    } catch (e: any) {
      setErr(e?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo<Counts>(
    () =>
      data?.totals ?? {
        overdue: 0,
        comingSoon: 0,
        notYet: 0,
      },
    [data]
  );

  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-text">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 rounded-xl border border-line bg-panel p-4 shadow">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Maintenance Dashboard</h1>
            <div className="ml-auto flex items-center gap-2 text-xs text-[--color-muted]">
              <span>Auto-refresh: {AUTO_REFRESH_MS / 1000}s</span>
              {lastFetch && (
                <span title={new Date(lastFetch).toLocaleString()}>
                  Last update: {fmtRelative(new Date(lastFetch).toISOString())}
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="red">Overdue: <strong className="ml-1">{totals.overdue}</strong></Badge>
            <Badge tone="yellow">Coming soon: <strong className="ml-1">{totals.comingSoon}</strong></Badge>
            <Badge>Not yet: <strong className="ml-1">{totals.notYet}</strong></Badge>
          </div>
          {err && (
            <div className="mt-3 rounded-md border border-[--color-bad]/30 bg-[#2a1010]/40 px-3 py-2 text-[--color-bad]">
              {err}
            </div>
          )}
        </header>

        <section className="rounded-xl border border-line bg-panel shadow">
          <div className="grid grid-cols-12 border-b border-line px-3 py-2 text-sm text-[--color-muted]">
            <div className="col-span-5">Vehicle</div>
            <div className="col-span-2">VIN</div>
            <div className="col-span-2">Shop</div>
            <div className="col-span-2">Counts</div>
            <div className="col-span-1 text-right">Updated</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-line">
            {loading && (
              <div className="px-3 py-4 text-sm text-[--color-muted]">Loading…</div>
            )}

            {!loading && data?.rows?.length === 0 && (
              <div className="px-3 py-4 text-sm text-[--color-muted]">
                No rows yet. Visit a VIN page to persist the first analysis.
              </div>
            )}

            {data?.rows?.map((row) => (
              <div key={row.vin} className="grid grid-cols-12 items-center px-3 py-3">
                <div className="col-span-5">
                  <div className="font-medium leading-tight">{row.vehicleTitle}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[--color-muted]">
                    <Badge tone="red">Overdue: {row.counts.overdue}</Badge>
                    <Badge tone="yellow">Soon: {row.counts.comingSoon}</Badge>
                    <Badge>Not yet: {row.counts.notYet}</Badge>
                    <Link
                      href={`/vehicles/${row.vin}/maintenance`}
                      className="ml-2 underline"
                    >
                      View
                    </Link>
                  </div>
                </div>

                <div className="col-span-2 truncate text-sm">{row.vin}</div>
                <div className="col-span-2 text-sm">{row.shop ?? "—"}</div>

                <div className="col-span-2">
                  <div className="flex flex-wrap gap-1 text-xs">
                    <Badge tone="red">{row.counts.overdue}</Badge>
                    <Badge tone="yellow">{row.counts.comingSoon}</Badge>
                    <Badge>{row.counts.notYet}</Badge>
                  </div>
                </div>

                <div className="col-span-1 text-right text-sm text-[--color-muted]">
                  <span title={row.updated ? new Date(row.updated).toLocaleString() : ""}>
                    {fmtRelative(row.updated)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line px-3 py-2 text-center text-xs text-[--color-muted]">
            Reading from <code>/api/dashboard</code>. Rows update automatically.
          </div>
        </section>
      </div>
    </main>
  );
}
