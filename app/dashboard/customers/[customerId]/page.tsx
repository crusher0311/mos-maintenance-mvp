// app/dashboard/customers/[customerId]/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { ObjectId } from "mongodb";
import Link from "next/link";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtMiles(m?: number | null) {
  if (m === 0) return "0";
  if (m == null) return "";
  return m.toLocaleString();
}
function isValidObjectId(id: string) {
  try { return new ObjectId(id).toHexString() === id.toLowerCase(); } catch { return false; }
}

export default async function CustomerDetailPage({
  params,
}: { params: { customerId: string } }) {
  const session = await requireSession();
  const db = await getDb();

  const id = params.customerId;
  if (!ObjectId.isValid(id)) return notFound();
  const _id = new ObjectId(id);

  // Load the customer (and ensure it belongs to this shop)
  const customer = await db.collection("customers").findOne(
    { _id, shopId: Number(session.shopId) },
    {
      projection: {
        firstName: 1,
        lastName: 1,
        name: 1,
        email: 1,
        phone: 1,
        lastVin: 1,
        lastRo: 1,
        lastMileage: 1,
        lastStatus: 1,
        updatedAt: 1,
        createdAt: 1,
      },
    }
  );
  if (!customer) return notFound();

  // Vehicles for this customer
  const vehicles = await db
    .collection("vehicles")
    .find({ shopId: Number(session.shopId), customerId: _id })
    .project({
      year: 1,
      make: 1,
      model: 1,
      vin: 1,
      lastMileage: 1,
      updatedAt: 1,
      createdAt: 1,
      license: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  // Repair orders for this customer
  const ros = await db
    .collection("repair_orders")
    .find({ shopId: Number(session.shopId), customerId: _id })
    .project({
      roNumber: 1,
      status: 1,
      mileage: 1,
      vin: 1,
      vehicleId: 1,
      updatedAt: 1,
      createdAt: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  const name =
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    (customer.name || "(no name)");

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{name}</h1>
        <Link href="/dashboard/customers" className="text-sm underline">
          ← Back to Customers
        </Link>
      </div>

      <section className="space-y-1 text-sm">
        {customer.email && (
          <div>
            <span className="font-medium">Email:</span> <code>{customer.email}</code>
          </div>
        )}
        {customer.phone && (
          <div>
            <span className="font-medium">Phone:</span> <code>{customer.phone}</code>
          </div>
        )}
        <div className="text-neutral-600">
          Updated: {new Date(customer.updatedAt ?? Date.now()).toLocaleString()}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Vehicles</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Vehicle</th>
                <th className="py-2 pr-4">VIN</th>
                <th className="py-2 pr-4">Miles</th>
                <th className="py-2 pr-4">Plate</th>
                <th className="py-2 pr-4">Updated</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v, i) => (
                <tr key={`${v._id}-${i}`} className="border-b last:border-b-0">
                  <td className="py-2 pr-4">
                    {[v.year, v.make, v.model].filter(Boolean).join(" ") || "(vehicle)"}
                  </td>
                  <td className="py-2 pr-4">
                    <code>{v.vin || ""}</code>
                  </td>
                  <td className="py-2 pr-4">{fmtMiles(v.lastMileage)}</td>
                  <td className="py-2 pr-4">{v.license || ""}</td>
                  <td className="py-2 pr-4">
                    {v.updatedAt ? new Date(v.updatedAt).toLocaleString() : ""}
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td className="py-6 text-neutral-600" colSpan={5}>
                    No vehicles on file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Repair Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">RO #</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Miles</th>
                <th className="py-2 pr-4">VIN</th>
                <th className="py-2 pr-4">Updated</th>
              </tr>
            </thead>
            <tbody>
              {ros.map((r, i) => (
                <tr key={`${r._id}-${i}`} className="border-b last:border-b-0">
                  <td className="py-2 pr-4"><code>{r.roNumber || ""}</code></td>
                  <td className="py-2 pr-4">{r.status || ""}</td>
                  <td className="py-2 pr-4">{fmtMiles(r.mileage)}</td>
                  <td className="py-2 pr-4"><code>{r.vin || ""}</code></td>
                  <td className="py-2 pr-4">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : ""}
                  </td>
                </tr>
              ))}
              {ros.length === 0 && (
                <tr>
                  <td className="py-6 text-neutral-600" colSpan={5}>
                    No repair orders yet.
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
