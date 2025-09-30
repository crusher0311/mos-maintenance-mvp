// app/dashboard/recommended/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import Link from "next/link";
import { resolveAutoflowConfig, fetchDviWithCache } from "@/lib/integrations/autoflow";
import { resolveCarfaxConfig, fetchCarfaxWithCache } from "@/lib/integrations/carfax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------- UI options -------------------- */
const MODEL_OPTIONS = [
  { id: "gpt-4.1", label: "GPT-4.1 (Balanced)" },
  { id: "gpt-4o", label: "GPT-4o (Fastest)" },
  { id: "gpt-4.1-turbo", label: "GPT-4.1 Turbo (Cheapest)" },
];

/* -------------------- small utils -------------------- */
function fmtMiles(m?: number | null) {
  if (m === 0) return "0";
  if (m == null) return "";
  return m.toLocaleString();
}

function toSquish(vin: string) {
  const v = String(vin).toUpperCase().trim();
  return v.slice(0, 8) + v.slice(9, 11);
}

/* -------------------- OEM (local Mongo) -------------------- */
async function getLocalOeFromMongo(vin: string) {
  const db = await getDb();
  const SQUISH = toSquish(vin);

  const pipeline = [
    { $match: { squish: SQUISH } },
    { $project: { _id: 0, squish: 1, vin_maintenance_id: 1, maintenance_id: 1 } },
    {
      $lookup: {
        from: "dataone_lkp_vin_maintenance_interval",
        let: { vmi: "$vin_maintenance_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$vin_maintenance_id", "$$vmi"] } } },
          { $project: { _id: 0, maintenance_interval_id: 1 } },
        ],
        as: "intervals",
      },
    },
    { $unwind: "$intervals" },
    {
      $lookup: {
        from: "dataone_def_maintenance_interval",
        localField: "intervals.maintenance_interval_id",
        foreignField: "maintenance_interval_id",
        as: "intDef",
      },
    },
    { $unwind: "$intDef" },
    {
      $lookup: {
        from: "dataone_def_maintenance",
        localField: "maintenance_id",
        foreignField: "maintenance_id",
        as: "def",
      },
    },
    { $unwind: "$def" },
    {
      $group: {
        _id: { maintenance_id: "$maintenance_id", interval_id: "$intervals.maintenance_interval_id" },
        maintenance_name: { $first: "$def.maintenance_name" },
        maintenance_category: { $first: "$def.maintenance_category" },
        maintenance_notes: { $first: "$def.maintenance_notes" },
        interval_type: { $first: "$intDef.interval_type" },
        value: { $first: "$intDef.value" },
        units: { $first: "$intDef.units" },
        initial_value: { $first: "$intDef.initial_value" },
      },
    },
    {
      $group: {
        _id: "$_id.maintenance_id",
        name: { $first: "$maintenance_name" },
        category: { $first: "$maintenance_category" },
        notes: { $first: "$maintenance_notes" },
        intervals: {
          $push: {
            type: "$interval_type",
            value: "$value",
            units: "$units",
            initial_value: "$initial_value",
          },
        },
      },
    },
    {
      $addFields: {
        miles: {
          $let: {
            vars: { m: { $filter: { input: "$intervals", as: "i", cond: { $eq: ["$$i.units", "Miles"] } } } },
            in: {
              $cond: [
                { $gt: [{ $size: "$$m" }, 0] },
                { $arrayElemAt: [{ $map: { input: "$$m", as: "x", in: "$$x.value" } }, 0] },
                null,
              ],
            },
          },
        },
        months: {
          $let: {
            vars: { m: { $filter: { input: "$intervals", as: "i", cond: { $eq: ["$$i.units", "Months"] } } } },
            in: {
              $cond: [
                { $gt: [{ $size: "$$m" }, 0] },
                { $arrayElemAt: [{ $map: { input: "$$m", as: "x", in: "$$x.value" } }, 0] },
                null,
              ],
            },
          },
        },
      },
    },
    { $project: { _id: 0, name: 1, category: 1, notes: 1, miles: 1, months: 1 } },
    { $sort: { category: 1, name: 1 } },
    { $limit: 200 },
  ];

  const items = await db
    .collection("dataone_lkp_vin_maintenance")
    .aggregate(pipeline, { allowDiskUse: true, hint: "squish_1" })
    .toArray();

  return items;
}

/* -------------------- Page -------------------- */
type PageProps = { searchParams: Promise<{ vin?: string; model?: string }> };

export default async function RecommendedPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const db = await getDb();

  const { vin: vinParam, model: modelParam } = await searchParams;
  const vin = (vinParam || "").toUpperCase().trim();
  const selectedModel = modelParam || MODEL_OPTIONS[0].id;

  // For links in the UI
  const VEHICLE_HREF = (v: string) => `/dashboard/vehicles/${encodeURIComponent(v)}`;
  const PLAN_HREF = (v: string) => `/dashboard/vehicles/${encodeURIComponent(v)}/plan`;

  // Data holders
  let vehicle: any = null;
  let latestRoNumber: string | null = null;

  // Analyzer result shape
  let analyzed:
    | {
        ok: boolean;
        modelUsed?: string;
        parsed?: { recommendations?: Array<any> };
        raw?: string;
        error?: string;
      }
    | null = null;

  if (vin) {
    // Vehicle + latest RO (for DVI)
    vehicle = await db
      .collection("vehicles")
      .findOne(
        { shopId: Number(session.shopId), vin },
        { projection: { year: 1, make: 1, model: 1, vin: 1, lastMileage: 1 } }
      );

    const ros = await db
      .collection("repair_orders")
      .find({ shopId: Number(session.shopId), $or: [{ vin }, { vehicleId: vehicle?._id }] })
      .project({ roNumber: 1, updatedAt: 1, createdAt: 1 })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1)
      .toArray();

    latestRoNumber = ros[0]?.roNumber ?? null;

    // --------- Fetch integrations (defensively) ---------
    let dvi: any = { ok: false, error: "Not available" };
    let carfax: any = { ok: false, error: "Not available" };
    let oem: any = [];

    try {
      const autoCfg = await resolveAutoflowConfig(Number(session.shopId));
      if (latestRoNumber && autoCfg.configured) {
        dvi = await fetchDviWithCache(Number(session.shopId), String(latestRoNumber), 10 * 60 * 1000);
      }
    } catch (e) {
      dvi = { ok: false, error: "Failed to fetch DVI" };
    }

    try {
      const carfaxCfg = await resolveCarfaxConfig(Number(session.shopId));
      if (carfaxCfg.configured) {
        carfax = await fetchCarfaxWithCache(Number(session.shopId), vin, 7 * 24 * 60 * 60 * 1000);
      }
    } catch (e) {
      carfax = { ok: false, error: "Failed to fetch CARFAX" };
    }

    try {
      oem = await getLocalOeFromMongo(vin);
    } catch (e) {
      oem = [];
    }

    // --------- Call analyzer API (absolute URL to avoid “Failed to parse URL”) ---------
    const BASE =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    try {
      const res = await fetch(`${BASE}/api/recommended/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          dviData: dvi ?? { ok: false, error: "Missing DVI" },
          carfaxData: carfax ?? { ok: false, error: "Missing CARFAX" },
          oemData: oem ?? [],
        }),
      });

      const data = await res.json();
      analyzed = data;
    } catch (e: any) {
      analyzed = { ok: false, error: e?.message ?? "Failed to contact analyzer." };
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recommended (AI)</h1>
        <div className="text-sm">
          <Link href="/dashboard" className="underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>

      {/* VIN + Model form (GET) */}
      <form className="rounded-2xl border p-4 space-y-3" method="get">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">VIN</label>
            <input
              type="text"
              name="vin"
              defaultValue={vin}
              placeholder="Enter VIN"
              className="w-full border rounded p-2 text-sm"
              required
            />
          </div>

        <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <select name="model" defaultValue={selectedModel} className="w-full border rounded p-2 text-sm">
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full sm:w-auto rounded bg-black text-white px-4 py-2 text-sm"
              title="Run analyzer"
            >
              Analyze
            </button>
          </div>
        </div>

        {vin && (
          <div className="text-xs text-neutral-600 mt-1">
            {(vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : "")}
            {vehicle?.lastMileage != null && ` • ${fmtMiles(vehicle.lastMileage)} mi`}
            {latestRoNumber && ` • RO ${latestRoNumber}`}
          </div>
        )}
      </form>

      {/* Results */}
      {!vin && (
        <div className="text-sm text-neutral-600">
          Enter a VIN and choose a model to generate prioritized recommendations.
        </div>
      )}

      {vin && analyzed && (
        <section className="space-y-4">
          {!analyzed.ok && (
            <div className="rounded-lg border p-3 text-sm text-red-700 bg-red-50">
              Failed to analyze: {analyzed.error || "Unknown error"}
            </div>
          )}

          {analyzed.ok && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-700">
                  Model: <code>{analyzed.modelUsed}</code>
                </div>
                <div className="flex gap-3 text-sm">
                  <Link href={VEHICLE_HREF(vin)} className="underline" target="_blank">
                    Open Vehicle
                  </Link>
                  <Link href={PLAN_HREF(vin)} className="underline" target="_blank">
                    Open Plan
                  </Link>
                </div>
              </div>

              {Array.isArray(analyzed?.parsed?.recommendations) && analyzed.parsed!.recommendations.length > 0 ? (
                <ul className="space-y-3">
                  {analyzed.parsed!.recommendations
                    .slice()
                    .sort((a: any, b: any) => (a?.priority ?? 999) - (b?.priority ?? 999))
                    .map((rec: any, i: number) => (
                      <li key={i} className="rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold">{rec.title ?? "(item)"}</div>
                            <div className="text-sm text-neutral-700 mt-1 whitespace-pre-wrap">
                              {rec.why ?? ""}
                            </div>
                            <div className="mt-2 text-xs text-neutral-600 flex flex-wrap gap-2">
                              {rec.priority != null && (
                                <span className="rounded-full bg-black text-white px-2 py-0.5">
                                  Priority {rec.priority}
                                </span>
                              )}
                              {Array.isArray(rec.sources) &&
                                rec.sources.map((s: string, idx: number) => (
                                  <span key={idx} className="rounded-full border px-2 py-0.5">
                                    {s}
                                  </span>
                                ))}
                              {rec.suggestedTiming && (
                                <span className="rounded-full bg-neutral-100 px-2 py-0.5">
                                  Timing: {rec.suggestedTiming}
                                </span>
                              )}
                            </div>
                            {rec.notes && (
                              <div className="mt-2 text-xs text-neutral-500 whitespace-pre-wrap">
                                Notes: {rec.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <div className="rounded-lg border p-3 text-sm text-neutral-700 bg-neutral-50">
                  No structured recommendations were returned.
                </div>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-sm">Raw model output</summary>
                <pre className="mt-2 text-xs bg-gray-50 p-3 rounded overflow-auto max-h-72">
                  {analyzed.raw}
                </pre>
              </details>
            </>
          )}
        </section>
      )}

      <form action="/api/auth/logout" method="post">
        <button className="rounded bg-black text-white px-4 py-2">Log out</button>
      </form>
    </main>
  );
}
