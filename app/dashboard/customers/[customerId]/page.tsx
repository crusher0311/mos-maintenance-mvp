// app/dashboard/customers/[customerId]/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: { customerId: string };
}) {
  const { shopId } = await requireSession();
  const db = await getDb();

  // customerId is the externalId in our model
  const customer = await db.collection("customers").findOne(
    { shopId, externalId: params.customerId },
    {
      projection: {
        name: 1,
        email: 1,
        phone: 1,
        externalId: 1,
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

  const vehicles = await db
    .collection("vehicles")
    .find({ shopId, customerExternalId: params.customerId })
    .project({
      vin: 1,
      year: 1,
      make: 1,
      model: 1,
      license: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1 })
    .limit(20)
    .toArray();

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-4">
      <a href="/dashboard/customers" className="text-sm underline">
        ← Back to Customers
      </a>
      <h1 className="text-2xl font-bold">{customer.name || "(no name)"}</h1>
      <p className="text-sm text-gray-700">
        {customer.email || "—"} · {customer.phone || "—"} · ext:{" "}
        {customer.externalId}
      </p>

      {(customer.lastVin || customer.lastRo || customer.lastMileage != null) && (
        <div className="text-sm">
          {customer.lastVin ? `VIN: ${customer.lastVin}` : ""}
          {customer.lastVin &&
          (customer.lastRo || customer.lastMileage != null)
            ? " · "
            : ""}{" "}
          {customer.lastRo ? `RO#: ${customer.lastRo}` : ""}
          {customer.lastRo && customer.lastMileage != null ? " · " : ""}{" "}
          {customer.lastMileage != null ? `Miles: ${customer.lastMileage}` : ""}
        </div>
      )}
      {customer.lastStatus && (
        <div className="text-xs text-gray-500">Last Status: {customer.lastStatus}</div>
      )}

      <section className="space-y-2">
        <h2 className="text-xl font-semibold mt-4">Vehicles</h2>
        {vehicles.length === 0 ? (
          <p className="text-sm text-gray-600">No vehicles on file yet.</p>
        ) : (
          <ul className="divide-y border rounded">
            {vehicles.map((v: any) => (
              <li key={v._id.toString()} className="p-3 space-y-1">
                <div className="font-medium">
                  <a
                    className="underline"
                    href={`/dashboard/customers/${encodeURIComponent(
                      customer.externalId
                    )}/vehicles/${encodeURIComponent(v.vin)}`}
                  >
                    {v.year || "—"} {v.make || ""} {v.model || ""} · VIN: {v.vin}
                  </a>
                </div>
                <div className="text-sm text-gray-700">
                  Plate: {v.license || "—"}
                </div>
                <div className="text-xs text-gray-500">
                  {v.updatedAt ? `Updated ${new Date(v.updatedAt).toLocaleString()}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
