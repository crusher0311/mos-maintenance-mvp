import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo";
import InviteForm from "./InviteForm";

// …inside the returned JSX, after the user info block:
<InviteForm />

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sid = cookies().get("sid")?.value;
  if (!sid) redirect("/login");

  const db = await getDb();
  const sessions = db.collection("sessions");
  const users = db.collection("users");

  const now = new Date();
  const sess = await sessions.findOne({ token: sid, expiresAt: { $gt: now } });
  if (!sess) redirect("/login");

  const user = await users.findOne(
    { _id: sess.userId },
    { projection: { email: 1, role: 1, shopId: 1 } }
  );
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="space-y-1 text-sm">
        <div>Email: <code>{user.email}</code></div>
        <div>Role: <code>{user.role}</code></div>
        <div>Shop ID: <code>{user.shopId}</code></div>
      </div>

      <form action="/api/auth/logout" method="post">
        <button className="rounded bg-black text-white px-4 py-2">Log out</button>
      </form>
    </main>
  );
}
