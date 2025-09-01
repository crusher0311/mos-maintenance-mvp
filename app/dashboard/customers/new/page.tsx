// app/dashboard/customers/new/page.tsx
import { requireSession } from "@/lib/auth";
import NewCustomerForm from "./NewCustomerForm";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const session = await requireSession(); // ensures redirect to /login if not authed

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Add Customer</h1>
        <p className="text-sm text-gray-600">Shop #{session.shopId}</p>
      </div>
      <NewCustomerForm />
    </main>
  );
}
