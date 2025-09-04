// app/dashboard/customers/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  _id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
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
  const explicit = [r.firstName ?? "", r.lastName ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  const fallback = (r.name ?? "").trim();
  const out = explicit || fallback;
  return out || "(no name)";
}

function fmtVehicle(v?: Row["vehicle"]) {
  if (!v) return "(no vehicle)";
  const parts = [v.year, v.make, v.model].filter(Boolean);
  return parts.length ? parts.join(" ") : "(no vehicle)";
}

function fmtMiles(m: number | null | undefined) {
  if (m === 0) return "0"; // keep 0 visible
  if (m == null) return ""; // hide only null/undefined
  return m.toLocaleString();
}

export default async function CustomersPage() {
  const session = await requireSession();
  const db = await getDb();

  // Require: name + vehicle (year/make/model) + RO number.
  const rows = (await db
    .collection("customers")
    .aggregate<Row>([
      { $match: { shopId: Number(session.shopId), name: { $type: "string", $ne: "" } } },

      // Attach latest vehicle for this customer
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
      { $addFields: { vehicle: { $arrayElemAt: ["$vehicle", 0] } } },

      // Attach latest repair order for this customer
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
      { $addFields: { latestRO: { $arrayElemAt: ["$latestRO", 0] } } },

      // Enforce vehicle + RO# presence
      {
        $match: {
          "vehicle.make": { $exists: true, $ne: null },
          "vehicle.model": { $exists: true, $ne: null },
          "vehicle.year": { $exists: true, $ne: null },
          "latestRO.roNumber": { $exists: true, $ne: null, $ne: "" },
        },
      },

      { $sort: { updatedAt: -1, createdAt: -1 } },
      { $limit: 100 },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          name: 1,
          vehicle: 1,
          latestRO: 1,
        },
      },
    ])
    .toArray()) as Row[];

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Link
          href="/dashboard/customers/new"
          className="rounded bg-black text-white px-3 py-2 text-sm"
        >
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const name = fmtName(r);
              const vehicle = fmtVehicle(r.vehicle || undefined);
              const vin = r.vehicle?.vin ?? "";
              const ro = r.latestRO?.roNumber ?? "";
              const miles = fmtMiles(r.latestRO?.mileage);

              return (
                <tr key={`${r._id}-${i}`} className="border-b last:border-b-0 align-top">
                  <td className="py-2 pr-4">
                    <Link href={`/dashboard/customers/${r._id}`} className="underline">
                      {name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{vehicle}</td>
                  <td className="py-2 pr-4">
                    {vin ? (
                      <Link
                        href={`/dashboard/vehicles/${encodeURIComponent(vin)}`}
                        className="underline"
                      >
                        <code>{vin}</code>
                      </Link>
                    ) : (
                      <code></code>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <code>{ro}</code>
                  </td>
                  <td className="py-2 pr-4">{miles}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="py-6 text-neutral-600" colSpan={5}>
                  No customers with name + vehicle + RO yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
