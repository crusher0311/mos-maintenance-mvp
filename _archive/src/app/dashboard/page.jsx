import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import clientPromise from "../../lib/mongodb";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2">Unauthorized</h1>
        <p><a className="underline" href="/login">Sign in</a> to continue.</p>
      </main>
    );
  }

  const client = await clientPromise;
  const db = client.db();
  const filter = session.user.role === "admin"
    ? {}
    : { ownerEmail: session.user.email.toLowerCase() };

  const shops = await db.collection("shops")
    .find(filter, { projection: { autoflowApiPassword: 0, autoflowApiKey: 0 } })
    .toArray();

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="border rounded p-4">
        <h2 className="font-semibold mb-2">Your Shops</h2>
        {shops.length === 0 ? (
          <p>No shops yet.</p>
        ) : (
          <ul className="list-disc pl-5">
            {shops.map((s) => (
              <li key={s._id}>{s.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="border rounded p-4">
        <h2 className="font-semibold mb-2">Add Shop</h2>
        <form action="/api/shops" method="post" className="space-y-3">
          <input className="border p-2 w-full rounded" name="name" placeholder="Shop Name" />
          <input className="border p-2 w-full rounded" name="autoflowBaseUrl" placeholder="Autoflow Base URL (optional)" />
          <input className="border p-2 w-full rounded" name="autoflowApiKey" placeholder="Autoflow API Key (optional)" />
          <input className="border p-2 w-full rounded" name="autoflowApiPassword" placeholder="Autoflow API Password (optional)" />
          <button className="bg-black text-white px-4 py-2 rounded">Create Shop</button>
        </form>
        <p className="text-sm text-gray-500 mt-2">Credentials are stored server-side and hidden from other users.</p>
      </section>
    </main>
  );
}

