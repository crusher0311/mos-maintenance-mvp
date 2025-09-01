// app/dashboard/customers/[customerId]/vehicles/[vin]/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function VehiclePage({
  params,
}: {
  params: { customerId: string; vin: string };
}) {
  const { shopId } = await requireSession();
  const db = await getDb();

  const customer = await db.collection("customers").findOne(
    { shopId, externalId: params.customerId },
    { projection: { name: 1, externalId: 1 } }
  );
  if (!customer) return notFound();

  const vehicle = await db.collection("vehicles").findOne(
    { shopId, vin: params.vin.toUpperCase() },
    { projection: { vin: 1, year: 1, make: 1, model: 1, license: 1, updatedAt: 1 } }
  );
  if (!vehicle) return notFound();

  const latestTicket = await db.collection("tickets").findOne(
    { shopId, vin: params.vin.toUpperCase() },
    { sort: { updatedAt: -1 }, projection: { roNumber: 1, status: 1, mileage: 1, updatedAt: 1 } }
  );

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-4">
      <a
        href={`/dashboard/customers/${encodeURIComponent(params.customerId)}`}
        className="text-sm underline"
      >
        ← Back to {customer.name || "Customer"}
      </a>

      <h1 className="text-2xl font-bold">
        {vehicle.year || "—"} {vehicle.make || ""} {vehicle.model || ""} · VIN: {vehicle.vin}
      </h1>
      <p className="text-sm text-gray-700">Plate: {vehicle.license || "—"}</p>

      {latestTicket && (
        <div className="text-sm">
          RO#: {latestTicket.roNumber || "—"} · Miles: {latestTicket.mileage ?? "—"} ·
          Status: {latestTicket.status || "—"}{" "}
          <span className="text-xs text-gray-500">
            (updated {new Date(latestTicket.updatedAt).toLocaleString()})
          </span>
        </div>
      )}

      <form
        action={`/api/vehicles/${encodeURIComponent(params.vin)}/refresh`}
        method="post"
      >
        <input type="hidden" name="shopId" value={String(shopId)} />
        <input type="hidden" name="customerExternalId" value={params.customerId} />
        <button
          className="rounded bg-black text-white px-3 py-2 text-sm"
          type="submit"
        >
          Refresh data (DVI · DataOne · Carfax · AI recommendations)
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold mt-4">Diagnostics & Recommendations</h2>
        <p className="text-sm text-gray-600">
          After refresh, we’ll import DVI, OEM data (DataOne), and Carfax, then run our AI prompt to produce a service plan here.
        </p>
        {/* TODO: Render compiled “recommendations” doc when ready */}
      </section>
    </main>
  );
}
