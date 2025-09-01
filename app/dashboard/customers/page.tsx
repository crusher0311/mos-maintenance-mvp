// app/dashboard/customers/page.tsx
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

async function getSession() {
  const token = cookies().get("mos_session")?.value;
  if (!token) return null;
  const db = await getDb();
  const session = await db
    .collection("sessions")
    .findOne({ token, expiresAt: { $gt: new Date() } });
  if (!session) return null;

  // join to users for email/role if you want
  const user = await db
    .collection("users")
    .findOne({ _id: session.userId }, { projection: { email: 1, role: 1 } });

  return {
    shopId: session.shopId as number,
    userEmail: user?.email ?? "",
    role: user?.role ?? "user",
  };
}

export default async function CustomersPage() {
  const sess = await getSession();
  if (!sess) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="mt-2">Please <a className="underline" href="/login">sign in</a>.</p>
      </main>
    );
  }

  const db = await getDb();
  const customers = await db
    .collection("customers")
    .find({ shopId: sess.shopId })
    .sort({ updatedAt: -1 })
    .limit(50)
    .project({ name: 1, firstName: 1, lastName: 1, email: 1, phone: 1, externalId: 1, updatedAt: 1 })
    .toArray();

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Customers</h1>
      <p className="text-sm text-gray-600">Showing latest updates for shop {sess.shopId}.</p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Email</th>
            <th className="py-2 pr-3">Phone</th>
            <th className="py-2 pr-3">External ID</th>
            <th className="py-2 pr-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c: any, i: number) => (
            <tr key={i} className="border-b">
              <td className="py-2 pr-3">
                {c.name || [c.firstName, c.lastName].filter(Boolean).join(" ")}
              </td>
              <td className="py-2 pr-3">{c.email || "-"}</td>
              <td className="py-2 pr-3">{c.phone || "-"}</td>
              <td className="py-2 pr-3">{c.externalId || "-"}</td>
              <td className="py-2 pr-3">{c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "-"}</td>
            </tr>
          ))}
          {customers.length === 0 && (
            <tr><td className="py-4 text-gray-500" colSpan={5}>No customers yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
