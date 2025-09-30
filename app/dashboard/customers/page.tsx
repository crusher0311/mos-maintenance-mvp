// app/dashboard/customers/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  _id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  status?: string | null;
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    vin?: string | null;
  } | null;
  latestRO?: {
    roNumber?: string | null;
    mileage?: number | null;
  } | null;
};

function fmtName(r: Row) {
  const explicit = [r.firstName ?? "", r.lastName ?? ""].filter(Boolean).join(" ").trim();
  const fallback = (r.name ?? "").trim();
  const out = explicit || fallback;
  return out || "(no name)";
}

function fmtVehicle(v?: Row["vehicle"]) {
  if (!v) return "";
  const parts = [v.year, v.make, v.model].filter(Boolean);
  return parts.length ? parts.join(" ") : "";
}

function fmtMiles(m: number | null | undefined) {
  if (m === 0) return "0";
  if (m == null) return "";
  return m.toLocaleString();
}

// Row is "empty" if it has no name *and* no vehicle text *and* no VIN/RO/Miles.
function isTotallyEmpty(r: Row): boolean {
  const hasName = Boolean((r.firstName ?? r.lastName ?? r.name ?? "").toString().trim());
  const vehicleText = fmtVehicle(r.vehicle || undefined);
  const vin = r.vehicle?.vin ?? "";
  const ro = r.latestRO?.roNumber ?? "";
  const miles = r.latestRO?.mileage ?? null;

  return !hasName && !vehicleText && !vin && !ro && (miles == null);
}

export default async function CustomersPage() {
  const session = await requireSession();
  const db = await getDb();

  // Optional cap via env: DEFAULT_CUSTOMERS_LIMIT=0 => show all
  const rawLimit = Number(process.env.DEFAULT_CUSTOMERS_LIMIT ?? "0");
  const limit = Number.isFinite(rawLimit) && rawLimit >= 0 ? Math.min(rawLimit, 2000) : 0;

  // Accept either string or number shopId
  const shopIdStr = String(session.shopId);
  const shopIdNum = Number(session.shopId);

  // “Open” = anything not explicitly closed
  const statusNotClosed = {
    $or: [{ status: { $exists: false } }, { status: null }, { status: { $ne: "closed" } }],
  };

  const pipeline: any[] = [
    {
      $match: {
        $and: [{ $or: [{ shopId: shopIdStr }, { shopId: shopIdNum }] }, statusNotClosed],
      },
    },
    // latest vehicle
    {
      $lookup: {
        from: "vehicles",
        let: { cid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$cid"] } } },
          { $sort: { updatedAt: -1, createdAt: -1 } },
          { $limit: 1 },
          { $project: { year: 1, make: 1, model: 1, vin: 1 } },
        ],
        as: "vehicle",
      },
    },
    { $addFields: { vehicle: { $ifNull: [{ $arrayElemAt: ["$vehicle", 0] }, null] } } },

    // latest repair order
    {
      $lookup: {
        from: "repair_orders",
        let: { cid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$cid"] } } },
          { $sort: { updatedAt: -1, createdAt: -1 } },
          { $limit: 1 },
          { $project: { roNumber: 1, mileage: 1 } },
        ],
        as: "latestRO",
      },
    },
    { $addFields: { latestRO: { $ifNull: [{ $arrayElemAt: ["$latestRO", 0] }, null] } } },

    // Sort newest first
    { $sort: { openedAt: -1, updatedAt: -1, createdAt: -1 } },

    ...(limit > 0 ? [{ $limit: limit }] : []),

    { $project: { firstName: 1, lastName: 1, name: 1, vehicle: 1, latestRO: 1, status: 1 } },
  ];

  const all = (await db.collection("customers").aggregate<Row>(pipeline).toArray()) as Row[];
  // Hide totally empty rows
  const rows = all.filter((r) => !isTotallyEmpty(r));

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Link href="/dashboard/customers/new" className="rounded bg-black text-white px-3 py-2 text-sm">
          Add Customer
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Vehicle</th>
              <th className="py-2 pr-4">VIN</th>
              <th className="py-2 pr-4">RO #</th>
              <th className="py-2 pr-4">Miles</th>
              <th className="py-2 pr-0 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const name = fmtName(r);
              const vehicle = fmtVehicle(r.vehicle || undefined);
              const vin = r.vehicle?.vin ?? "";
              const ro = r.latestRO?.roNumber ?? "";
              const miles = fmtMiles(r.latestRO?.mileage);

              const planLink = vin ? `/dashboard/vehicles/${encodeURIComponent(vin)}/plan` : null;
              const vehicleLink = vin ? `/dashboard/vehicles/${encodeURIComponent(vin)}` : null;

              return (
                <tr key={`${r._id}-${i}`} className="border-b last:border-b-0 align-top">
                  <td className="py-2 pr-4">
                    <Link href={`/dashboard/customers/${r._id}`} className="underline">
                      {name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{vehicle || "—"}</td>
                  <td className="py-2 pr-4">
                    {vin ? (
                      <Link href={vehicleLink!} className="underline">
                        <code>{vin}</code>
                      </Link>
                    ) : (
                      <code>—</code>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <code>{ro || "—"}</code>
                  </td>
                  <td className="py-2 pr-4">{miles || "—"}</td>
                  <td className="py-2 pr-0 text-right whitespace-nowrap">
                    {/* Inspect (opens new tab) */}
                    <Link
                      href={`/api/customers/${r._id}`}
                      className="underline"
                      title="View raw/normalized data"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Inspect
                    </Link>
                    {/* Plan (opens new tab) */}
                    {planLink ? (
                      <>
                        {" · "}
                        <Link
                          href={planLink}
                          className="underline"
                          title="Open maintenance plan"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Plan
                        </Link>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="py-6 text-neutral-600" colSpan={6}>
                  No open customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
