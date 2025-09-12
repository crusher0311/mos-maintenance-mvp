// app/dashboard/vehicles/[vin]/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import Link from "next/link";
import { fetchDviWithCache, resolveAutoflowConfig } from "@/lib/integrations/autoflow";
import { fetchCarfaxWithCache, resolveCarfaxConfig } from "@/lib/integrations/carfax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------- small utils ---------- */
function fmtMiles(m?: number | null) {
  if (m === 0) return "0";
  if (m == null) return "";
  return m.toLocaleString();
}
function daysBetween(a: Date, b: Date) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}
function parseCarfaxDate(d?: string | null): Date | null {
  if (!d) return null;
  const trimmed = String(d).trim();
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yy = Number(m[3]);
    const dt = new Date(yy, mm - 1, dd);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}
function toSquish(vin: string) {
  const v = String(vin).toUpperCase().trim();
  // DataOne “squish” = 8 VIN chars + 2 after the check digit (skip position 9)
  return v.slice(0, 8) + v.slice(9, 11);
}
function StatusChip({ value }: { value: unknown }) {
  const s = String(value ?? "");
  if (s === "0") return <span className="inline-block">❌</span>;
  if (s === "1") return <span className="inline-block">⚠️</span>;
  if (s === "2") return <span className="inline-block">✅</span>;
  return <>{s || ""}</>;
}

/* ---------- resolve current miles: RO → AutoFlow → vehicle ---------- */
async function getLatestMilesForVin(db: any, vinRaw: string): Promise<number | null> {
  const vin = String(vinRaw || "").toUpperCase();
  const toPos = (v: unknown) => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // Latest RO mileage
  const ro = await db.collection("repair_orders").findOne(
    { vin },
    { sort: { updatedAt: -1, createdAt: -1 }, projection: { mileage: 1 } }
  );
  const mRO = toPos(ro?.mileage);

  // Latest AF or manual close event with mileage
  const af = await db.collection("events").aggregate([
    {
      $match: {
        $expr: {
          $eq: [
            {
              $toUpper: {
                $ifNull: ["$vehicleVin", { $ifNull: ["$vin", "$payload.vehicle.vin"] }],
              },
            },
            vin,
          ],
        },
        $or: [{ provider: "autoflow" }, { provider: "ui", type: "manual_closed" }],
      },
    },
    {
      $addFields: {
        createdAtDate: {
          $cond: [
            { $eq: [{ $type: "$createdAt" }, "date"] },
            "$createdAt",
            { $dateFromString: { dateString: { $toString: "$createdAt" }, onError: null, onNull: null } },
          ],
        },
      },
    },
    { $sort: { createdAtDate: -1 } },
    { $limit: 1 },
    {
      $project: {
        _id: 0,
        miles: {
          $ifNull: [
            "$payload.ticket.mileage",
            {
              $ifNull: [
                "$payload.mileage",
                { $ifNull: ["$payload.vehicle.mileage", { $ifNull: ["$payload.vehicle.miles", "$payload.vehicle.odometer"] }] },
              ],
            },
          ],
        },
      },
    },
  ]).next();
  const mAF = toPos(af?.miles);

  // Vehicle-level odometer/lastMileage
  const veh = await db.collection("vehicles").findOne({ vin }, { projection: { odometer: 1, lastMileage: 1 } });
  const mVeh = toPos(veh?.odometer) ?? toPos(veh?.lastMileage);

  return mRO ?? mAF ?? mVeh ?? null;
}

/* ---------- local OEM schedule directly from Mongo (unchanged) ---------- */
async function getLocalOeFromMongo(vin: string) {
  const db = await getDb();
  const SQUISH = toSquish(vin);

  const pipeline = [
    { $match: { squish: SQUISH } },
    { $project: { _id: 0, squish: 1, vin_maintenance_id: 1, maintenance_id: 1 } },

    // join intervals via vin_maintenance_id
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

    // interval definitions
    {
      $lookup: {
        from: "dataone_def_maintenance_interval",
        localField: "intervals.maintenance_interval_id",
        foreignField: "maintenance_interval_id",
        as: "intDef",
      },
    },
    { $unwind: "$intDef" },

    // maintenance definitions
    {
      $lookup: {
        from: "dataone_def_maintenance",
        localField: "maintenance_id",
        foreignField: "maintenance_id",
        as: "def",
      },
    },
    { $unwind: "$def" },

    // dedupe per (maintenance_id, interval_id)
    {
      $group: {
        _id: {
          maintenance_id: "$maintenance_id",
          interval_id: "$intervals.maintenance_interval_id",
        },
        squish: { $first: "$squish" },
        maintenance_name: { $first: "$def.maintenance_name" },
        maintenance_category: { $first: "$def.maintenance_category" },
        maintenance_notes: { $first: "$def.maintenance_notes" },
        interval_type: { $first: "$intDef.interval_type" },
        value: { $first: "$intDef.value" },
        units: { $first: "$intDef.units" },
        initial_value: { $first: "$intDef.initial_value" },
      },
    },

    // roll up one doc per maintenance_id
    {
      $group: {
        _id: "$_id.maintenance_id",
        squish: { $first: "$squish" },
        maintenance_name: { $first: "$maintenance_name" },
        maintenance_category: { $first: "$maintenance_category" },
        maintenance_notes: { $first: "$maintenance_notes" },
        intervals: {
          $push: {
            interval_id: "$_id.interval_id",
            type: "$interval_type",
            value: "$value",
            units: "$units",
            initial_value: "$initial_value",
          },
        },
      },
    },

    // extract first Miles/Months into columns
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

    {
      $project: {
        _id: 0,
        maintenance_id: "$_id",
        name: "$maintenance_name",
        category: "$maintenance_category",
        notes: "$maintenance_notes",
        miles: 1,
        months: 1,
        intervals: 1,
      },
    },
    { $sort: { category: 1, name: 1 } },
    { $limit: 200 },
  ];

  const items = await db
    .collection("dataone_lkp_vin_maintenance")
    .aggregate(pipeline, { allowDiskUse: true, hint: "squish_1" })
    .toArray();

  return { ok: true as const, vin, squish: SQUISH, count: items.length, items };
}

/* ---------- page ---------- */
type PageProps = { params: Promise<{ vin: string }> };

export default async function VehicleDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const db = await getDb();
  const shopId = Number(session.shopId);

  const { vin: vinParam } = await params;
  const vin = String(vinParam || "").toUpperCase();

  const vehicle = await db.collection("vehicles").findOne(
    { shopId, vin },
    {
      projection: {
        year: 1,
        make: 1,
        model: 1,
        vin: 1,
        license: 1,
        lastMileage: 1,
        odometer: 1,
        updatedAt: 1,
        customerId: 1,
      },
    }
  );

  if (!vehicle) {
    return (
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Vehicle</h1>
          <Link href="/dashboard/customers" className="text-sm underline">
            ← Back to Customers
          </Link>
        </div>
        <p className="text-sm">
          No vehicle found for VIN <code>{vin}</code>.
        </p>
      </main>
    );
  }

  // ✅ Resolve current miles (used in header and to patch the latest RO row if it's 0)
  const resolvedMiles = await getLatestMilesForVin(db, vin);

  const customer = vehicle.customerId
    ? await db.collection("customers").findOne(
        { _id: vehicle.customerId },
        { projection: { firstName: 1, lastName: 1, name: 1, email: 1, phone: 1 } }
      )
    : null;

  const ownerName =
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim() || (customer?.name || "");

  const ros = await db
    .collection("repair_orders")
    .find({ shopId, $or: [{ vehicleId: vehicle._id }, { vin }] })
    .project({ roNumber: 1, status: 1, mileage: 1, updatedAt: 1, createdAt: 1 })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  const latestRoNumber = ros[0]?.roNumber ?? null;

  // Autoflow
  const cfg = await resolveAutoflowConfig(shopId);
  const dvi =
    latestRoNumber && cfg.configured
      ? await fetchDviWithCache(shopId, String(latestRoNumber), 10 * 60 * 1000)
      : latestRoNumber
      ? { ok: false, error: "AutoFlow not connected." as const }
      : { ok: false, error: "No RO found for this vehicle." as const };

  // CARFAX
  const carfaxCfg = await resolveCarfaxConfig(shopId);
  const carfax = carfaxCfg.configured
    ? await fetchCarfaxWithCache(shopId, vin, 7 * 24 * 60 * 60 * 1000)
    : { ok: false, error: "CARFAX not configured." as const };

  // Miles/day from CARFAX (ignore invalid/zero/older 'today' readings)
  type MpDCalc = {
    mpdFromToday?: number | null;
    mpdFromTwo?: number | null;
    mpdBlended?: number | null;
    latestDate?: Date | null;
    latestMiles?: number | null;
    prevDate?: Date | null;
    prevMiles?: number | null;
  };
  const mpd: MpDCalc = {};
  if ((carfax as any).ok && Array.isArray((carfax as any).serviceRecords)) {
    const recs = (carfax as any).serviceRecords
      .map((r: any) => ({ date: parseCarfaxDate(r?.date ?? null), miles: typeof r?.odometer === "number" ? r.odometer : null }))
      .filter((r: any) => r.date && typeof r.miles === "number") as { date: Date; miles: number }[];

    recs.sort((a, b) => b.date.getTime() - a.date.getTime());

    const now = new Date();
    const todayMilesRaw =
      typeof resolvedMiles === "number"
        ? resolvedMiles
        : typeof vehicle.lastMileage === "number"
        ? vehicle.lastMileage
        : null;

    // valid only if positive and not behind latest CARFAX miles
    const todayIsValid = typeof todayMilesRaw === "number" && todayMilesRaw > 0 && (!recs[0] || todayMilesRaw >= recs[0].miles);

    if (todayIsValid && recs[0]) {
      const days = Math.max(1, daysBetween(now, recs[0].date));
      const delta = (todayMilesRaw as number) - recs[0].miles;
      const val = delta / days;
      mpd.mpdFromToday = Math.abs(val) < 0.01 ? null : val; // treat near-zero as no signal
      mpd.latestDate = recs[0].date;
      mpd.latestMiles = recs[0].miles;
    }

    if (recs[0] && recs[1]) {
      const days = Math.max(1, daysBetween(recs[0].date, recs[1].date));
      const delta = recs[0].miles - recs[1].miles;
      mpd.mpdFromTwo = delta / days;
      mpd.prevDate = recs[1].date;
      mpd.prevMiles = recs[1].miles;
    }

    if (mpd.mpdFromToday != null && mpd.mpdFromTwo != null) {
      mpd.mpdBlended = (mpd.mpdFromToday + mpd.mpdFromTwo) / 2;
    } else {
      mpd.mpdBlended = mpd.mpdFromTwo ?? mpd.mpdFromToday ?? null;
    }
  }

  // Local OEM schedule (from Mongo)
  const localOe = await getLocalOeFromMongo(vin);

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"}
        </h1>
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/vehicles/${vin}/plan`} className="text-sm underline">
            Customer Plan
          </Link>
          <Link href="/dashboard/customers" className="text-sm underline">
            ← Back to Customers
          </Link>
        </div>
      </div>

      {/* Vehicle details */}
      <section className="space-y-1 text-sm">
        <div>
          <span className="font-medium">VIN:</span> <code>{vehicle.vin}</code>
        </div>
        {vehicle.license && (
          <div>
            <span className="font-medium">Plate:</span> {vehicle.license}
          </div>
        )}
        <div>
          <span className="font-medium">Last Miles:</span>{" "}
          {fmtMiles(
            (() => {
              const m = (resolvedMiles ?? vehicle.lastMileage) as number | null | undefined;
              return typeof m === "number" && m > 0 ? m : null;
            })()
          )}
        </div>
        <div className="text-neutral-600">
          Updated: {vehicle.updatedAt ? new Date(vehicle.updatedAt).toLocaleString() : ""}
        </div>
      </section>

      {/* Repair Orders */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Repair Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">RO #</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Miles</th>
                <th className="py-2 pr-4">Updated</th>
              </tr>
            </thead>
            <tbody>
              {ros.map((r: any, i: number) => {
                const isLatest = i === 0;
                const rawMiles = typeof r.mileage === "number" ? r.mileage : null;
                const displayMiles =
                  isLatest && (!rawMiles || rawMiles <= 0) && resolvedMiles != null ? resolvedMiles : rawMiles;
                const needsHighlight = isLatest && (!rawMiles || rawMiles <= 0);

                return (
                  <tr key={`${r._id}-${i}`} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">
                      <code>{r.roNumber || ""}</code>
                    </td>
                    <td className="py-2 pr-4">{r.status || ""}</td>
                    <td className="py-2 pr-4">
                      <span className={needsHighlight ? "bg-red-100 px-1 rounded" : undefined}>
                        {fmtMiles(displayMiles)}
                      </span>
                      {needsHighlight && resolvedMiles != null && (
                        <span className="ml-2 text-[11px] text-neutral-500">(resolved)</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : ""}</td>
                  </tr>
                );
              })}
              {ros.length === 0 && (
                <tr>
                  <td className="py-6 text-neutral-600" colSpan={4}>
                    No repair orders for this vehicle yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Autoflow DVI */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">DVI Results {latestRoNumber ? `(RO ${latestRoNumber})` : ""}</h2>
          {!cfg.configured && (
            <Link href="/dashboard/settings/autoflow" className="text-sm underline">
              Connect AutoFlow
            </Link>
          )}
        </div>

        {!latestRoNumber && <p className="text-sm text-neutral-600">No RO found for this vehicle.</p>}

        {latestRoNumber && !(dvi as any).ok && (
          <div className="text-sm text-red-600">Failed to load DVI: {(dvi as any).error}</div>
        )}

        {(dvi as any).ok && (
          <div className="rounded-2xl border p-4 space-y-4 text-sm">
            <div className="grid gap-1">
              <div>
                <span className="font-medium">Sheet:</span> {(dvi as any).sheetName || "(unknown sheet)"}
              </div>
              <div>
                <span className="font-medium">Time:</span>{" "}
                {(dvi as any).timestamp ? new Date((dvi as any).timestamp).toLocaleString() : "(unknown)"}
              </div>
              {((dvi as any).advisor || (dvi as any).technician) && (
                <div>
                  <span className="font-medium">Advisor/Tech:</span>{" "}
                  {[(dvi as any).advisor, (dvi as any).technician].filter(Boolean).join(" / ")}
                </div>
              )}
              <div className="flex gap-4 flex-wrap">
                {(dvi as any).pdfUrl && (
                  <a href={(dvi as any).pdfUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Open DVI PDF
                  </a>
                )}
                {(dvi as any).shopUrl && (
                  <a href={(dvi as any).shopUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Shop View
                  </a>
                )}
                {(dvi as any).customerUrl && (
                  <a href={(dvi as any).customerUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Customer View
                  </a>
                )}
              </div>
            </div>

            {Array.isArray((dvi as any).categories) && (dvi as any).categories.length > 0 ? (
              <div className="space-y-4">
                {(dvi as any).categories.map((cat: any, i: number) => (
                  <div key={i} className="rounded-xl border p-3">
                    <div className="font-medium">
                      {cat.name || "(Category)"}
                      {cat.video ? " • has video" : ""}
                    </div>
                    {cat.videoNotes && <div className="text-neutral-600 text-xs">{cat.videoNotes}</div>}
                    <div className="mt-2">
                      {Array.isArray(cat.items) && cat.items.length > 0 ? (
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="text-left border-b">
                              <th className="py-1 pr-3">Item</th>
                              <th className="py-1 pr-3">Status</th>
                              <th className="py-1 pr-3">Notes</th>
                              <th className="py-1 pr-3">Media</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cat.items.map((it: any, j: number) => (
                              <tr key={j} className="border-b last:border-b-0 align-top">
                                <td className="py-1 pr-3">{it.name || ""}</td>
                                <td className="py-1 pr-3">
                                  <StatusChip value={it.status} />
                                </td>
                                <td className="py-1 pr-3 whitespace-pre-wrap">{it.notes || ""}</td>
                                <td className="py-1 pr-3">
                                  <div className="flex gap-2 flex-wrap">
                                    {Array.isArray(it.pictures) &&
                                      it.pictures.map((u: string, k: number) =>
                                        u ? (
                                          <a key={`p-${k}`} href={u} target="_blank" rel="noopener noreferrer" className="underline">
                                            photo {k + 1}
                                          </a>
                                        ) : null
                                      )}
                                    {Array.isArray(it.videos) &&
                                      it.videos.map((u: string, k: number) =>
                                        u ? (
                                          <a key={`v-${k}`} href={u} target="_blank" rel="noopener noreferrer" className="underline">
                                            video {k + 1}
                                          </a>
                                        ) : null
                                      )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-neutral-600 text-xs">No items.</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-neutral-600 text-sm">No DVI categories/items found.</div>
            )}

            <details className="mt-2">
              <summary className="cursor-pointer">Raw JSON</summary>
              <pre className="mt-2 text-xs bg-gray-50 p-3 rounded overflow-auto max-h-72">
                {JSON.stringify((dvi as any).raw, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* CARFAX */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">CARFAX</h2>
          {!carfaxCfg.configured && (
            <Link href="/dashboard/settings/carfax" className="text-sm underline">
              Connect CARFAX
            </Link>
          )}
        </div>

        {!(carfax as any).ok && <div className="text-sm text-red-600">Failed to load CARFAX: {(carfax as any).error}</div>}

        {(carfax as any).ok && (
          <div className="rounded-2xl border p-4 space-y-4 text-sm">
            <div className="grid gap-1">
              <div>
                <span className="font-medium">VIN:</span> {(carfax as any).vin}
              </div>
              {(carfax as any).reportDate && (
                <div>
                  <span className="font-medium">Report Date:</span> {(carfax as any).reportDate}
                </div>
              )}
              {(carfax as any).lastReportedMileage != null && (
                <div>
                  <span className="font-medium">Last Reported Miles:</span>{" "}
                  {fmtMiles((carfax as any).lastReportedMileage)}
                </div>
              )}
            </div>

            {(mpd.mpdFromToday != null || mpd.mpdFromTwo != null) && (
              <div className="rounded-xl border p-3 bg-neutral-50">
                <div className="font-medium mb-1">Miles per day (estimated)</div>
                <ul className="list-disc ml-5 space-y-1">
                  {mpd.mpdFromToday != null && (
                    <li>
                      From today vs last CARFAX{" "}
                      {mpd.latestDate ? `(${mpd.latestDate.toLocaleDateString()} → today)` : ""}:{" "}
                      <strong>{mpd.mpdFromToday.toFixed(1)}</strong> mi/day
                      {mpd.latestMiles != null ? ` • last miles: ${fmtMiles(mpd.latestMiles)}` : ""}
                      {typeof (resolvedMiles ?? vehicle.lastMileage) === "number"
                        ? ` • today miles: ${fmtMiles((resolvedMiles ?? vehicle.lastMileage) as number)}`
                        : ""}
                    </li>
                  )}
                  {mpd.mpdFromTwo != null && (
                    <li>
                      From two latest CARFAX entries{" "}
                      {mpd.latestDate && mpd.prevDate
                        ? `(${mpd.prevDate.toLocaleDateString()} → ${mpd.latestDate.toLocaleDateString()})`
                        : ""}
                      : <strong>{mpd.mpdFromTwo.toFixed(1)}</strong> mi/day
                    </li>
                  )}
                  {mpd.mpdBlended != null && (
                    <li>
                      Blended estimate: <strong>{mpd.mpdBlended.toFixed(1)}</strong> mi/day
                    </li>
                  )}
                </ul>
              </div>
            )}

            {Array.isArray((carfax as any).serviceRecords) && (carfax as any).serviceRecords.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium">Service Records</h3>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-1 pr-3">Date</th>
                      <th className="py-1 pr-3">Miles</th>
                      <th className="py-1 pr-3">Description</th>
                      <th className="py-1 pr-3">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(carfax as any).serviceRecords.map((r: any, i: number) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="py-1 pr-3">{r.date || ""}</td>
                        <td className="py-1 pr-3">{fmtMiles(r.odometer)}</td>
                        <td className="py-1 pr-3">{r.description || ""}</td>
                        <td className="py-1 pr-3">{r.location || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-neutral-600 text-sm">No service history records returned.</div>
            )}

            <details className="mt-2">
              <summary className="cursor-pointer">Raw JSON</summary>
              <pre className="mt-2 text-xs bg-gray-50 p-3 rounded overflow-auto max-h-72">
                {JSON.stringify((carfax as any).raw, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* OEM Services (Local Mongo) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">OEM Services</h2>

        <div className="rounded-2xl border p-4 space-y-3 text-sm">
          <div className="text-neutral-700">
            Using local schedule for <code>{vin}</code>{" "}
            {typeof (resolvedMiles ?? vehicle.lastMileage) === "number"
              ? `(current miles: ${fmtMiles((resolvedMiles ?? vehicle.lastMileage) as number)})`
              : ""}
          </div>

          {localOe.ok && Array.isArray(localOe.items) && localOe.items.length > 0 ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-3">Service</th>
                  <th className="py-1 pr-3">Category</th>
                  <th className="py-1 pr-3">Interval</th>
                  <th className="py-1 pr-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {localOe.items.map((s: any, i: number) => (
                  <tr key={`${s.maintenance_id || i}`} className="border-b last:border-b-0 align-top">
                    <td className="py-1 pr-3">
                      <div className="font-medium">{s.name || "(service)"}</div>
                      <div className="text-neutral-500 text-[11px]">#{s.maintenance_id}</div>
                    </td>
                    <td className="py-1 pr-3">{s.category || ""}</td>
                    <td className="py-1 pr-3">
                      {s.miles || s.months ? (
                        <>
                          {s.miles ? `${fmtMiles(s.miles)} mi` : ""}
                          {s.miles && s.months ? " / " : ""}
                          {s.months ? `${s.months} mo` : ""}
                        </>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="py-1 pr-3">{s.notes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-neutral-600">No OEM services returned.</div>
          )}

          <details className="mt-2">
            <summary className="cursor-pointer">Raw JSON</summary>
            <pre className="mt-2 text-xs bg-gray-50 p-3 rounded overflow-auto max-h-72">
              {JSON.stringify(localOe, null, 2)}
            </pre>
          </details>
        </div>
      </section>
    </main>
  );
}
