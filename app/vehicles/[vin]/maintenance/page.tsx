"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";

/* ---------------- Types ---------------- */
type ServiceItem = {
  id?: string;
  name: string;
  status: "overdue" | "coming_soon" | "not_yet";
  dueDateLabel?: string;
  notes?: string;
};

type AnalyzeResponse = {
  vehicle?: { year?: number; make?: string; model?: string; trim?: string; vin?: string };
  avgMilesPerDay?: number;
  overdue?: ServiceItem[];
  comingSoon?: ServiceItem[];
  notYet?: ServiceItem[];
  __debug?: Record<string, any>;
};

/* ---------------- Small UI bits ---------------- */
function Badge({
  children,
  tone = "muted" as "muted" | "red" | "yellow" | "blue",
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

function StatusDot({ status }: { status: ServiceItem["status"] }) {
  const cls =
    status === "overdue"
      ? "bg-[--color-bad]"
      : status === "coming_soon"
      ? "bg-[--color-soon]"
      : "bg-[--color-good]";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ring-1 ring-line ${cls}`} />;
}

/* Selectable row */
function Row({
  item,
  checked = false,
  onToggle,
}: {
  item: ServiceItem;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const tone =
    item.status === "overdue" ? "red" : item.status === "coming_soon" ? "yellow" : "muted";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-panel/60 p-3 hover:bg-panel">
      <input
        type="checkbox"
        className="size-4 accent-[--color-accent]"
        checked={checked}
        onChange={onToggle}
        aria-label={`Select ${item.name}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate font-medium">{item.name}</div>
          {item.dueDateLabel && <Badge tone={tone as any}>{item.dueDateLabel}</Badge>}
        </div>
        {item.notes && <div className="mt-1 truncate text-sm text-[--color-muted]">{item.notes}</div>}
      </div>
      <StatusDot status={item.status} />
    </div>
  );
}

/* ---------------- Normalization helpers ---------------- */
const asItem = (name: any, status: ServiceItem["status"]): ServiceItem => {
  if (name && typeof name === "object") {
    const it = name as any;
    const n = it.name ?? it.title ?? it.service ?? it.operation ?? "Service";
    const due =
      it.dueDateLabel ?? it.due_label ?? (it.dueDate ? `Due: ${it.dueDate}` : undefined);
    const statusRaw = String(
      it.status ?? it.recommendation_status ?? it.category ?? status
    ).toLowerCase();
    const st =
      statusRaw.includes("overdue") || statusRaw.includes("past")
        ? "overdue"
        : statusRaw.includes("soon")
        ? "coming_soon"
        : status;
    return { id: it.id, name: String(n), status: st as any, dueDateLabel: due, notes: it.notes ?? it.note ?? it.comment };
  }
  return { name: String(name ?? "Service"), status };
};

function pushAll(arr: any[], dest: ServiceItem[], status: ServiceItem["status"]) {
  if (!Array.isArray(arr)) return;
  for (const it of arr) dest.push(asItem(it, status));
}

function collectFromCandidate(
  cand: any,
  buckets: { overdue: ServiceItem[]; soon: ServiceItem[]; notYet: ServiceItem[] }
) {
  if (!cand || typeof cand !== "object") return;

  // services/items list with per-item status
  const services = cand.services ?? cand.items ?? cand.list;
  if (Array.isArray(services)) {
    for (const it of services) {
      const statusRaw = String(
        it?.status ?? it?.recommendation_status ?? it?.category ?? "not_yet"
      ).toLowerCase();
      if (statusRaw.includes("overdue") || statusRaw.includes("past")) {
        buckets.overdue.push(asItem(it, "overdue"));
      } else if (statusRaw.includes("soon")) {
        buckets.soon.push(asItem(it, "coming_soon"));
      } else {
        buckets.notYet.push(asItem(it, "not_yet"));
      }
    }
  }

  // groups container
  if (cand.groups) {
    pushAll(cand.groups.overdue ?? cand.groups.past_due, buckets.overdue, "overdue");
    pushAll(cand.groups.coming_soon ?? cand.groups.dueSoon ?? cand.groups.due_soon, buckets.soon, "coming_soon");
    pushAll(cand.groups.not_yet ?? cand.groups.notYet, buckets.notYet, "not_yet");
  }

  // direct arrays with various names
  for (const k of Object.keys(cand)) {
    const v = (cand as any)[k];
    if (!Array.isArray(v)) continue;
    const key = k.toLowerCase();
    if (key.includes("overdue") || key.includes("past")) {
      pushAll(v, buckets.overdue, "overdue");
    } else if (key.includes("coming") || key.includes("due_soon") || key.includes("soon")) {
      pushAll(v, buckets.soon, "coming_soon");
    } else if (key.includes("not_yet") || key.includes("notyet") || key.includes("future")) {
      pushAll(v, buckets.notYet, "not_yet");
    }
  }

  // nested details container (string lists)
  if (cand.details) {
    pushAll(cand.details.overdue ?? cand.details.past_due, buckets.overdue, "overdue");
    pushAll(cand.details.coming_soon ?? cand.details.due_soon, buckets.soon, "coming_soon");
    pushAll(cand.details.not_yet ?? cand.details.future, buckets.notYet, "not_yet");
  }
}

function normalizeAnalyze(raw: any): AnalyzeResponse {
  const vehicle = {
    vin: raw?.vin,
    make: raw?.make,
    model: raw?.model,
    year: raw?.year,
  };
  const avg = raw?.miles_per_day_used ?? raw?.avgMilesPerDay;

  // Your shape: analysis.maintenance_comparison is the primary source
  const mc = raw?.analysis?.maintenance_comparison;
  const rootCandidates = [mc, raw?.analysis, raw];

  const buckets = { overdue: [] as ServiceItem[], soon: [] as ServiceItem[], notYet: [] as ServiceItem[] };
  for (const cand of rootCandidates) collectFromCandidate(cand, buckets);

  return {
    vehicle,
    avgMilesPerDay: avg,
    overdue: buckets.overdue,
    comingSoon: buckets.soon,
    notYet: buckets.notYet,
    __debug: {
      topLevelKeys: Object.keys(raw ?? {}),
      analysisKeys: raw?.analysis ? Object.keys(raw.analysis ?? {}) : null,
      mcKeys: mc ? Object.keys(mc) : null,
      sizes: {
        overdue: buckets.overdue.length,
        comingSoon: buckets.soon.length,
        notYet: buckets.notYet.length,
      },
    },
  };
}

/* ---------------- Page ----------------
   Next.js 15: params is a Promise → unwrap with React.use()
---------------------------------------- */
export default function MaintenancePage({
  params,
}: {
  params: Promise<{ vin: string }>;
}) {
  const { vin } = use(params);

  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // selection state
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const toggleSelect = (name: string) =>
    setSelected((s) => ({ ...s, [name]: !s[name] }));
  const selectedNames = Object.keys(selected).filter((k) => selected[k]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setErr(null);
        const r = await fetch(`/api/maintenance/analyze/${vin}?r=${Date.now()}`, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        const normalized = normalizeAnalyze(raw);
        setData(normalized);
      } catch (e: any) {
        setErr(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [vin]);

  const vehicleTitle = useMemo(() => {
    const v = data?.vehicle;
    if (!v) return vin;
    return `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""} ${v.trim ?? ""}`.replace(/\s+/g, " ").trim();
  }, [data, vin]);

  const overdue = data?.overdue ?? [];
  const comingSoon = data?.comingSoon ?? [];
  const notYet = data?.notYet ?? [];

  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-text">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header card */}
        <div className="rounded-xl border border-line bg-panel p-5 shadow-lg">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-line bg-[#0e1622] p-2">
              <div className="h-6 w-6 rounded-md border border-line" />
            </div>
            <h1 className="text-xl font-semibold">{vehicleTitle || vin}</h1>
            <div className="ml-auto flex items-center gap-2">
              <Badge tone="blue">VIN: {data?.vehicle?.vin ?? vin}</Badge>
              {typeof data?.avgMilesPerDay === "number" && (
                <Badge>{data!.avgMilesPerDay.toFixed(2)} mi/day</Badge>
              )}
              <Link href="/" className="rounded-md border border-line bg-[#0e1622] px-3 py-1 text-sm">
                Home
              </Link>
              <button
                onClick={() => location.reload()}
                className="rounded-md border border-[#1a3ea8] bg-gradient-to-b from-[#2b68ff] to-[#1f4dcc] px-3 py-1 text-sm"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Legend + Debug toggle */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[--color-muted]">
            <span className="flex items-center gap-2"><StatusDot status="overdue" /> Overdue</span>
            <span className="flex items-center gap-2"><StatusDot status="coming_soon" /> Coming soon</span>
            <span className="flex items-center gap-2"><StatusDot status="not_yet" /> Not yet</span>
            {process.env.NODE_ENV !== "production" && (
              <button
                onClick={() => setShowDebug((s) => !s)}
                className="ml-auto rounded-md border border-line bg-[#0e1622] px-2 py-1"
              >
                {showDebug ? "Hide" : "Show"} Raw Analysis (debug)
              </button>
            )}
          </div>

          {showDebug && data?.__debug && (
            <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-line bg-[#0e1622] p-3 text-xs text-[--color-muted]">
{JSON.stringify(data.__debug, null, 2)}
            </pre>
          )}
        </div>

        {/* Content */}
        <div className="mt-6 grid gap-6">
          {loading && (
            <div className="rounded-xl border border-line bg-panel p-5 text-[--color-muted]">
              Loading maintenance analysis…
            </div>
          )}
          {err && (
            <div className="rounded-xl border border-line bg-[#2a1010]/50 p-5 text-[--color-bad]">
              {err}
            </div>
          )}

          {!loading && !err && (
            <>
              {/* Overdue */}
              <section className="rounded-xl border border-line bg-panel p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Overdue</h2>
                  <Badge tone="red">{overdue.length}</Badge>
                </div>
                <div className="grid gap-3">
                  {overdue.map((it, i) => (
                    <Row
                      key={it.id ?? it.name ?? i}
                      item={it}
                      checked={!!selected[it.name]}
                      onToggle={() => toggleSelect(it.name)}
                    />
                  ))}
                  {overdue.length === 0 && (
                    <div className="rounded-lg border border-line bg-[#0e1622] p-4 text-sm text-[--color-muted]">
                      Nothing overdue. Nice!
                    </div>
                  )}
                </div>
              </section>

              {/* Coming Soon */}
              {comingSoon.length > 0 && (
                <section className="rounded-xl border border-line bg-panel p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Coming Soon</h2>
                    <Badge tone="yellow">{comingSoon.length}</Badge>
                  </div>
                  <div className="grid gap-3">
                    {comingSoon.map((it, i) => (
                      <Row
                        key={it.id ?? it.name ?? i}
                        item={it}
                        checked={!!selected[it.name]}
                        onToggle={() => toggleSelect(it.name)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Not Yet */}
              <section className="rounded-xl border border-line bg-panel p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Not Yet</h2>
                  <Badge>{notYet.length}</Badge>
                </div>
                <div className="grid gap-3">
                  {notYet.map((it, i) => (
                    <Row
                      key={it.id ?? it.name ?? i}
                      item={it}
                      checked={!!selected[it.name]}
                      onToggle={() => toggleSelect(it.name)}
                    />
                  ))}
                </div>
              </section>

              {/* Footer actions */}
              <div className="flex items-center gap-3">
                <div className="text-xs text-[--color-muted]">
                  Selected: <span className="font-medium">{selectedNames.length}</span>
                </div>
                <button className="ml-auto rounded-lg border border-line bg-[#0e1622] px-4 py-2">
                  Plan View
                </button>
                <button
                  className="rounded-lg border border-[#1a3ea8] bg-gradient-to-b from-[#2b68ff] to-[#1f4dcc] px-4 py-2 disabled:opacity-50"
                  disabled={selectedNames.length === 0}
                  onClick={async () => {
                    const payload = { vin, items: selectedNames.map((name) => ({ name })) };
                    console.log("Send to Estimate →", payload);
                    // TODO: POST to your estimate endpoint:
                    // await fetch("/api/estimate/create", {
                    //   method: "POST",
                    //   headers: { "Content-Type": "application/json" },
                    //   body: JSON.stringify(payload),
                    // });
                    alert(`Sending ${selectedNames.length} item(s) to estimate…`);
                  }}
                >
                  Send to Estimate
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[--color-muted]">
          This page POSTs to <code>/api/maintenance/analyze/{vin}</code> with <code>cache: &quot;no-store&quot;</code>.
        </p>
      </div>
    </main>
  );
}
