"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/* ---------------- Types ---------------- */
type Counts = { overdue: number; comingSoon: number; notYet: number };

type Row = {
  vin: string;
  vehicleTitle: string;
  shop?: string | null;
  counts: Counts;
  updated?: string | null;
};

type DashboardData = {
  rows: Row[];
  totals: Counts;
  __debug?: Record<string, any>;
};

/* ---------------- Helpers ---------------- */
const z = (n: any) => (Number.isFinite(+n) ? +n : 0);

function coerceCounts(r: any): Counts {
  // direct counts object?
  const c =
    r?.counts ??
    r?.count ??
    r?.summary ??
    r;

  // 1) explicit object keys
  const mapObj = (o: any): Counts => ({
    overdue:
      z(o?.overdue) ||
      z(o?.overdue_count) ||
      z(o?.past_due) ||
      z(o?.pastDue),
    comingSoon:
      z(o?.comingSoon) ||
      z(o?.coming_soon) ||
      z(o?.dueSoon) ||
      z(o?.due_soon) ||
      z(o?.soon),
    notYet:
      z(o?.notYet) ||
      z(o?.not_yet) ||
      z(o?.future) ||
      z(o?.ok),
  });

  if (c && typeof c === "object" && !Array.isArray(c)) {
    const m = mapObj(c);
    if (m.overdue || m.comingSoon || m.notYet) return m;
  }

  // 2) pull from row-level number fields
  const m2 = mapObj(r ?? {});
  if (m2.overdue || m2.comingSoon || m2.notYet) return m2;

  // 3) parse summary string like: "overdue: 5due: 0coming soon: 15not yet: 14"
  const s = String(c ?? r?.summary ?? r ?? "");
  const rx = (label: string) =>
    (s.match(new RegExp(`${label}\\s*:\\s*(\\d+)`, "i")) || [])[1];

  const parsed: Counts = {
    overdue: z(rx("overdue|past[_ ]?due")),
    comingSoon: z(rx("(coming[_ ]?soon|due[_ ]?soon|soon)")),
    notYet: z(rx("(not[_ ]?yet|future)")),
  };
  if (parsed.overdue || parsed.comingSoon || parsed.notYet) return parsed;

  return { overdue: 0, comingSoon: 0, notYet: 0 };
}

function vehicleTitleFrom(r: any): string {
  const t =
    r?.vehicleTitle ||
    r?.vehicle ||
    r?.name ||
    `${r?.year ?? ""} ${r?.make ?? ""} ${r?.model ?? ""} ${r?.trim ?? ""}`;
  return String(t).replace(/\s+/g, " ").trim();
}

function normalizeDashboard(raw: any): DashboardData {
  const arr: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.rows)
    ? raw.rows
    : Array.isArray(raw?.items)
    ? raw.items
    : [];

  const rows: Row[] = arr.map((r) => ({
    vin: String(r?.vin ?? r?.VIN ?? "").trim(),
    vehicleTitle: vehicleTitleFrom(r),
    shop: r?.shop ?? r?.shop_name ?? null,
    counts: coerceCounts(r),
    updated: r?.updated ?? r?.updated_at ?? r?.timestamp ?? null,
  }));

  const totals = rows.reduce(
    (acc, r) => {
      acc.overdue += r.counts.overdue;
      acc.comingSoon += r.counts.comingSoon;
      acc.notYet += r.counts.notYet;
      return acc;
    },
    { overdue: 0, comingSoon: 0, notYet: 0 } as Counts
  );

  return {
    rows,
    totals,
    __debug: {
      topLevelKeys: Object.keys(raw ?? {}),
      sampleRowKeys: rows[0] ? Object.keys(arr[0] ?? {}) : null,
      rowCount: rows.length,
    },
  };
}

function Badge({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "red" | "yellow" | "blue";
  children: React.ReactNode;
}) {
  const map = {
    muted: "bg-[#0e1622] text-[--color-muted] border-line",
    red: "bg-[#2a1010] text-[--color-bad] border-[--color-bad]/40",
    yellow: "bg-[#2b260e] text-[--color-soon] border-[--color-soon]/40",
    blue: "bg-[#0e1a2b] text-[--color-accent] border-[--color-accent]/40",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${map[tone]}`}>
      {children}
    </span>
  );
}

/* ---------------- Page ---------------- */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/dashboard?r=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        setData(normalizeDashboard(raw));
      } catch (e: any) {
        setErr(e?.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.rows;
    return data.rows.filter(
      (r) =>
        r.vin.toLowerCase().includes(needle) ||
        r.vehicleTitle.toLowerCase().includes(needle) ||
        (r.shop ?? "").toLowerCase().includes(needle)
    );
  }, [data, q]);

  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-text">
      <div className="mx-auto w-full max-w-6xl">
        {/* Header */}
        <div className="rounded-xl border border-line bg-panel p-5 shadow-lg">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">Maintenance Dashboard</h1>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search VIN, vehicle, shop…"
                className="rounded-md border border-line bg-[#0e1622] px-3 py-1 text-sm outline-none"
              />
              {process.env.NODE_ENV !== "production" && (
                <button
                  onClick={() => setShowDebug((s) => !s)}
                  className="rounded-md border border-line bg-[#0e1622] px-2 py-1 text-sm"
                >
                  {showDebug ? "Hide" : "Show"} Debug
                </button>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-[#0e1622] p-3">
              <div className="text-sm text-[--color-muted]">Overdue</div>
              <div className="text-2xl font-semibold text-[--color-bad]">
                {data?.totals.overdue ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-[#0e1622] p-3">
              <div className="text-sm text-[--color-muted]">Coming soon</div>
              <div className="text-2xl font-semibold text-[--color-soon]">
                {data?.totals.comingSoon ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-[#0e1622] p-3">
              <div className="text-sm text-[--color-muted]">Not yet</div>
              <div className="text-2xl font-semibold">
                {data?.totals.notYet ?? 0}
              </div>
            </div>
          </div>

          {showDebug && data?.__debug && (
            <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-line bg-[#0e1622] p-3 text-xs text-[--color-muted]">
{JSON.stringify(data.__debug, null, 2)}
            </pre>
          )}
        </div>

        {/* Table/List */}
        <div className="mt-6 rounded-xl border border-line bg-panel">
          <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_0.6fr] items-center gap-3 border-b border-line px-4 py-3 text-sm text-[--color-muted] max-sm:hidden">
            <div>Vehicle</div>
            <div>VIN</div>
            <div>Shop</div>
            <div>Counts</div>
            <div>Updated</div>
          </div>

          {loading && (
            <div className="px-4 py-6 text-[--color-muted]">Loading…</div>
          )}
          {err && (
            <div className="px-4 py-6 text-[--color-bad]">{err}</div>
          )}

          {!loading && !err && filtered.length === 0 && (
            <div className="px-4 py-6 text-[--color-muted]">No rows.</div>
          )}

          <div className="divide-y divide-line">
            {filtered.map((r) => (
              <div
                key={r.vin}
                className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.vehicleTitle || "(Vehicle)"}</div>
                  <div className="mt-1 hidden text-xs text-[--color-muted] sm:block">
                    <span className="mr-2">VIN:</span>
                    <span className="font-mono">{r.vin}</span>
                  </div>
                </div>

                <div className="font-mono sm:hidden">{r.vin}</div>
                <div className="truncate">{r.shop ?? "—"}</div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="red">Overdue: {r.counts.overdue}</Badge>
                  <Badge tone="yellow">Soon: {r.counts.comingSoon}</Badge>
                  <Badge>Not yet: {r.counts.notYet}</Badge>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <div className="hidden text-xs text-[--color-muted] sm:block">
                    {r.updated ? new Date(r.updated).toLocaleString() : "—"}
                  </div>
                  <Link
                    href={`/vehicles/${encodeURIComponent(r.vin)}/maintenance`}
                    className="rounded-md border border-[#1a3ea8] bg-gradient-to-b from-[#2b68ff] to-[#1f4dcc] px-3 py-1 text-sm"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[--color-muted]">
          Reading from <code>/api/dashboard</code>. Rows usually updated by your batch that hits{" "}
          <code>/api/maintenance/analyze/&lt;vin&gt;</code>.
        </p>
      </div>
    </main>
  );
}
