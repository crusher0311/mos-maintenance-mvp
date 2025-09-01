// app/dashboard/customers/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic"; // ensure cookies are read at request time

type Customer = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  externalId?: string;
  createdAt?: Date;
};

export default async function CustomersPage() {
  const { shopId, email } = await requireSession();
  const db = await getDb();

  const customers = (await db
    .collection("customers")
    .find({ shopId })
    .project({ name: 1, email: 1, phone: 1, externalId: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
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
        <p className="text-sm">No customers yet.</p>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Showing {customers.length} most recent customers
          </p>
          <ul className="divide-y border rounded">
            {customers.map((c) => (
              <li key={c._id} className="p-3 space-y-1">
                <div className="font-medium">{c.name || "(no name)"}</div>
                <div className="text-sm text-gray-700">
                  {c.email || "—"} · {c.phone || "—"} · ext:{" "}
                  {c.externalId || "—"}
                </div>
                <div className="text-xs text-gray-500">
                  {c.createdAt
                    ? new Date(c.createdAt).toLocaleString()
                    : ""}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
