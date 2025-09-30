import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type AnalyzeItem = { service: string; status: "overdue" | "due" | "not_yet" | "coming_soon" | string };
type AnalyzeResponse = {
  vin: string;
  inputs?: {
    odometer?: number;
    monthsInService?: number;
    milesPerDayUsed?: number;
  };
  analysis?: { maintenance_comparison?: { items?: AnalyzeItem[]; source_notes?: string[] } };
  counts?: Record<string, number>;
};
type OEInterval = { type?: string; value?: number; units?: "Miles" | "Months"; initial?: number };
type OEService = {
  name: string;
  category?: string;
  intervals?: OEInterval[];
  notes?: string | null;
  eng_notes?: string | null;
  trans_notes?: string | null;
  trim_notes?: string | null;
};
type OEResponse = {
  services?: OEService[];
};

function badgeColor(status: string) {
  switch ((status || "").toLowerCase()) {
    case "overdue": return "bg-red-100 text-red-800";
    case "due": return "bg-amber-100 text-amber-800";
    case "coming_soon": return "bg-blue-100 text-blue-800";
    case "not_yet": return "bg-gray-100 text-gray-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

// Await headers() per Next.js 15 dynamic APIs
async function getBaseUrl() {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// ------- ETA helpers -------
const AVG_DAYS_PER_MONTH = 30.4375;

function nextDueFromEvery(current: number, value?: number, initial?: number) {
  const v = Number(value ?? NaN);
  const init = Number(initial ?? 0);
  if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(current)) return null;
  const n = Math.max(0, Math.floor((current - init) / v));
  const lastDue = init + n * v;
  const nextDue = lastDue + v;
  if (!Number.isFinite(nextDue)) return null;
  return nextDue;
}

function etaForIntervals(opts: {
  odometer?: number;
  monthsInService?: number;
  milesPerDay?: number;
  intervals?: OEInterval[];
}) {
  const { odometer, monthsInService, milesPerDay, intervals } = opts;
  if (!Array.isArray(intervals) || intervals.length === 0) return null;

  let bestDays: number | null = null;
  let label = "";
  let milesToNextBest: number | null = null;

  for (const iv of intervals) {
    if (!iv) continue;
    const t = (iv.type ?? "Every").toLowerCase();
    if (t !== "every") continue;

    if (iv.units === "Miles" && Number.isFinite(odometer)) {
      const nextDue = nextDueFromEvery(odometer as number, iv.value, iv.initial);
      if (nextDue != null) {
        const milesToNext = nextDue - (odometer as number);
        if (milesToNext > 0) {
          let days: number | null = null;
          if (Number.isFinite(milesPerDay) && (milesPerDay as number) > 0) {
            days = milesToNext / (milesPerDay as number);
          }
          const candidateDays = days ?? Number.POSITIVE_INFINITY;
          if (bestDays == null || candidateDays < bestDays) {
            bestDays = Number.isFinite(candidateDays) ? candidateDays : null;
            milesToNextBest = milesToNext;
            label = "miles";
          }
        }
      }
    }

    if (iv.units === "Months" && Number.isFinite(monthsInService)) {
      const nextDueMonths = nextDueFromEvery(monthsInService as number, iv.value, iv.initial);
      if (nextDueMonths != null) {
        const monthsToNext = nextDueMonths - (monthsInService as number);
        if (monthsToNext > 0) {
          const days = monthsToNext * AVG_DAYS_PER_MONTH;
          if (bestDays == null || days < bestDays) {
            bestDays = days;
            milesToNextBest = null; // months-based path
            label = "months";
          }
        }
      }
    }
  }

  if (bestDays == null && milesToNextBest == null) return null;

  return {
    basis: label as "miles" | "months",
    daysToNext: bestDays ?? null,
    milesToNext: milesToNextBest ?? null,
  };
}

function fmtDays(days?: number | null) {
  if (!Number.isFinite(days as number) || (days as number) <= 0) return "soon";
  const d = days as number;
  if (d < 60) return `~${Math.round(d)} days`;
  const months = d / AVG_DAYS_PER_MONTH;
  return `~${months.toFixed(1)} mo`;
}

function fmtMiles(mi?: number | null) {
  if (!Number.isFinite(mi as number) || (mi as number) <= 0) return "0 mi";
  return Math.round(mi as number).toLocaleString() + " mi";
}

export default async function VehiclePage(props: { params: Promise<{ vin: string }> }) {
  // Next.js 15: params is a Promise
  const { vin: vinParam } = await props.params;
  const vin = vinParam.toUpperCase();

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
    include: {
      recommendations: { orderBy: { updatedAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!vehicle) return notFound();

  // Build analyzer link (runs server endpoint that can persist)
  const odoQS = vehicle.odometer ? `?odometer=${vehicle.odometer}` : "";
  const analyzeHref = `/api/vehicle/analyze/${vin}${odoQS}`;

  // Always fetch live analyze (for avg mi/day etc)
  const qs = new URLSearchParams({
    odometer: vehicle.odometer ? String(vehicle.odometer) : "",
    schedule: "normal",
    horizonMiles: "0",
    horizonMonths: "0",
    year: vehicle.year ? String(vehicle.year) : "",
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    debug: "1", // include debug so we can introspect if needed
  });
  const base = await getBaseUrl();
  const analyzeUrl = `${base}/api/maintenance/analyze/${vin}?${qs.toString()}`;
  const oeUrl = `${base}/api/oe/fetch/${vin}?schedule=normal&year=${encodeURIComponent(
    String(vehicle.year ?? "")
  )}&make=${encodeURIComponent(vehicle.make ?? "")}&model=${encodeURIComponent(vehicle.model ?? "")}`;

  let avgMiPerDay: number | undefined;
  let monthsInService: number | undefined;
  let odometer: number | undefined;

  let liveItems: AnalyzeItem[] = [];
  let liveCounts: Record<string, number> | undefined;

  try {
    const res = await fetch(analyzeUrl, { cache: "no-store" });
    if (res.ok) {
      const data: AnalyzeResponse = await res.json();
      odometer = data.inputs?.odometer;
      monthsInService = data.inputs?.monthsInService;
      avgMiPerDay = data.inputs?.milesPerDayUsed;

      const items = data.analysis?.maintenance_comparison?.items ?? [];
      // actionable (for the Recommendations table fallback)
      liveItems = items.filter((i) => i.status === "overdue" || i.status === "due");
      liveCounts = data.counts;

      // If analyzer didn't provide mi/day but did provide odo + months, estimate
      if ((!Number.isFinite(avgMiPerDay as number) || (avgMiPerDay as number) <= 0)
        && Number.isFinite(odometer as number)
        && Number.isFinite(monthsInService as number)
        && (monthsInService as number) > 0) {
        const days = (monthsInService as number) * AVG_DAYS_PER_MONTH;
        avgMiPerDay = (odometer as number) / days;
      }
    }
  } catch {
    // ignore; page still renders
  }

  // Fetch OE services to compute ETAs for not_yet items
  let upcoming: Array<{ service: string; days?: number | null; miles?: number | null; basis: "miles" | "months" }> = [];
  try {
    const res = await fetch(oeUrl, { cache: "no-store" });
    if (res.ok) {
      const oe: OEResponse = await res.json();
      const services = oe.services ?? [];

      // We also need the not_yet list from analyzer; fetch minimal version if we didn't keep it
      let notYet: AnalyzeItem[] = [];
      {
        const res2 = await fetch(analyzeUrl, { cache: "no-store" });
        if (res2.ok) {
          const data2: AnalyzeResponse = await res2.json();
          const items2 = data2.analysis?.maintenance_comparison?.items ?? [];
          notYet = items2.filter((i) => String(i.status).toLowerCase() === "not_yet");
        }
      }

      // Map by service name for quick lookup
      const ivByName = new Map<string, OEInterval[]>();
      for (const s of services) {
        ivByName.set(s.name, s.intervals ?? []);
      }

      for (const it of notYet) {
        const ivs = ivByName.get(it.service) ?? [];
        const eta = etaForIntervals({
          odometer,
          monthsInService,
          milesPerDay: avgMiPerDay,
          intervals: ivs,
        });
        if (!eta) continue;
        upcoming.push({
          service: it.service,
          days: eta.daysToNext ?? undefined,
          miles: eta.milesToNext ?? undefined,
          basis: eta.basis,
        });
      }
    }
  } catch {
    // swallow; upcoming stays empty
  }

  // Sort Upcoming by soonest ETA (days if we have them; otherwise by miles)
  upcoming.sort((a, b) => {
    const da = Number.isFinite(a.days as number) ? (a.days as number) : Number.POSITIVE_INFINITY;
    const db = Number.isFinite(b.days as number) ? (b.days as number) : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const ma = Number.isFinite(a.miles as number) ? (a.miles as number) : Number.POSITIVE_INFINITY;
    const mb = Number.isFinite(b.miles as number) ? (b.miles as number) : Number.POSITIVE_INFINITY;
    return ma - mb;
  });

  const showLive = !vehicle.recommendations.length && liveItems.length > 0;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Vehicle • {vin}</h1>
        <div className="flex items-center gap-4">
          <a
            href={analyzeHref}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
            title="Run analyzer now and save recommendations"
          >
            Run analysis
          </a>
          <a href="/dashboard" className="text-blue-600 hover:underline">
            Back to dashboard
          </a>
        </div>
      </div>

      {/* Stats */}
      <section className="grid md:grid-cols-5 gap-4">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Year</div>
          <div className="text-xl font-semibold">{vehicle.year ?? "-"}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Make</div>
          <div className="text-xl font-semibold">{vehicle.make ?? "-"}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Model</div>
          <div className="text-xl font-semibold">{vehicle.model ?? "-"}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Odometer</div>
          <div className="text-xl font-semibold">
            {vehicle.odometer?.toLocaleString() ?? "-"}
          </div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Avg mi/day</div>
          <div className="text-xl font-semibold">
            {Number.isFinite(avgMiPerDay as number)
              ? (avgMiPerDay as number).toLocaleString(undefined, { maximumFractionDigits: 1 })
              : "—"}
          </div>
        </div>
      </section>

      {/* Recommendations */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recommendations</h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">Service</th>
                <th className="p-3">Status</th>
                <th className="p-3">Notes</th>
                <th className="p-3">Source</th>
                <th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {/* Stored recommendations (if any) */}
              {!!vehicle.recommendations.length &&
                vehicle.recommendations.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">{r.name}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${badgeColor(r.status)}`}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3">{r.notes ?? "-"}</td>
                    <td className="p-3">{r.source ?? "-"}</td>
                    <td className="p-3">{new Date(r.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}

              {/* Live analysis fallback */}
              {showLive &&
                liveItems.map((i, idx) => (
                  <tr key={`live-${idx}`} className="border-t">
                    <td className="p-3">{i.service}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${badgeColor(i.status)}`}>
                        {i.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3">-</td>
                    <td className="p-3">OE (live)</td>
                    <td className="p-3">—</td>
                  </tr>
                ))}

              {/* Empty state */}
              {!vehicle.recommendations.length && !showLive && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    No recommendations yet. Try{" "}
                    <a
                      href={analyzeHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      running analysis
                    </a>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Optional counts display when using live analysis */}
        {showLive && liveCounts && (
          <div className="mt-2 text-xs text-gray-500">
            Counts: {Object.entries(liveCounts).map(([k, v]) => `${k}=${v}`).join(" · ")}
          </div>
        )}
      </section>

      {/* Upcoming */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Upcoming</h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">Service</th>
                <th className="p-3">Due In</th>
                <th className="p-3">Basis</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.length > 0 ? (
                upcoming.map((u, idx) => (
                  <tr key={`up-${idx}`} className="border-t">
                    <td className="p-3">{u.service}</td>
                    <td className="p-3">
                      {u.basis === "miles"
                        ? `${fmtMiles(u.miles)} (${fmtDays(u.days)})`
                        : `${fmtDays(u.days)}`}
                    </td>
                    <td className="p-3 capitalize">{u.basis}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-gray-500">
                    No upcoming items calculated.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-gray-500">
          * “Due in” is estimated using avg mi/day and OE intervals. Months are approximated at {AVG_DAYS_PER_MONTH} days/month.
        </div>
      </section>

      {/* Recent events */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recent Events</h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">Type</th>
                <th className="p-3">Source</th>
                <th className="p-3">Snippet</th>
              </tr>
            </thead>
            <tbody>
              {vehicle.events.map((e) => {
                const typeLabel =
                  typeof (e as any).type === "string" ? (e as any).type : JSON.stringify((e as any).type);
                return (
                  <tr key={e.id} className="border-t">
                    <td className="p-3">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="p-3">{typeLabel}</td>
                    <td className="p-3">{e.source ?? "-"}</td>
                    <td className="p-3 text-gray-600 truncate">
                      {JSON.stringify(e.payload).slice(0, 120)}...
                    </td>
                  </tr>
                );
              })}
              {!vehicle.events.length && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-500">
                    No events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
