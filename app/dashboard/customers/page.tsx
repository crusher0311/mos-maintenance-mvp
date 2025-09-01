// app/dashboard/customers/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

type Customer = {
  _id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  lastVin?: string | null;
  lastRo?: string | null;
  lastMileage?: number | null;
  lastStatus?: string | null;
};

export default async function CustomersPage() {
  const { shopId, email } = await requireSession();
  const db = await getDb();

  const customers = (await db
    .collection("customers")
    .find({
      shopId,
      $or: [{ lastStatus: { $exists: false } }, { lastStatus: { $ne: "Close" } }],
    })
    .project({
      name: 1,
      email: 1,
      phone: 1,
      externalId: 1,
      createdAt: 1,
      updatedAt: 1,
      lastVin: 1,
      lastRo: 1,
      lastMileage: 1,
      lastStatus: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(50)
    .toArray()) as Customer[];

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <a
          href="/dashboard/customers/new"
          className="rounded bg-black text-white px-3 py-2 text-sm"
        >
          Add Customer
        </a>
      </div>

      <p className="text-sm text-gray-600">
        Signed in as {email} · Shop #{shopId}
      </p>

      {customers.length === 0 ? (
        <p className="text-sm">No active customers right now.</p>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Showing {customers.length} most recent active customers
          </p>
          <ul className="divide-y border rounded">
            {customers.map((c) => {
              const customerHref = c.externalId
                ? `/dashboard/customers/${encodeURIComponent(c.externalId)}`
                : undefined;
              const vehicleHref =
                c.externalId && c.lastVin
                  ? `/dashboard/customers/${encodeURIComponent(
                      c.externalId
                    )}/vehicles/${encodeURIComponent(c.lastVin)}`
                  : undefined;

              return (
                <li key={c._id} className="p-3 space-y-1">
                  <div className="font-medium">
                    {customerHref ? (
                      <a className="underline" href={customerHref}>
                        {c.name || "(no name)"}
                      </a>
                    ) : (
                      c.name || "(no name)"
                    )}
                  </div>

                  <div className="text-sm text-gray-700">
                    {c.email || "—"} · {c.phone || "—"} · ext:{" "}
                    {c.externalId || "—"}
                  </div>

                  {(c.lastVin || c.lastRo || c.lastMileage != null) && (
                    <div className="text-sm">
                      {c.lastVin ? (
                        vehicleHref ? (
                          <>
                            VIN:{" "}
                            <a className="underline" href={vehicleHref}>
                              {c.lastVin}
                            </a>
                          </>
                        ) : (
                          `VIN: ${c.lastVin}`
                        )
                      ) : (
                        ""
                      )}
                      {c.lastVin && (c.lastRo || c.lastMileage != null) ? " · " : ""}
                      {c.lastRo ? `RO#: ${c.lastRo}` : ""}
                      {c.lastRo && c.lastMileage != null ? " · " : ""}
                      {c.lastMileage != null ? `Miles: ${c.lastMileage}` : ""}
                    </div>
                  )}

                  {c.lastStatus && (
                    <div className="text-xs text-gray-500">
                      Status: {c.lastStatus}
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    {c.updatedAt
                      ? `Updated ${new Date(c.updatedAt).toLocaleString()}`
                      : c.createdAt
                      ? `Created ${new Date(c.createdAt).toLocaleString()}`
                      : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
