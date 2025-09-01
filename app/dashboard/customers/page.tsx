// app/dashboard/customers/page.tsx
import { requireSession } from '@/lib/auth';
import { getDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic'; // ensure cookies are read at request time

export default async function CustomersPage() {
  const { shopId, email } = await requireSession();
  const db = await getDb();

  const customers = await db
    .collection('customers')
    .find({ shopId })
    .project({ name: 1, email: 1, phone: 1, externalId: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">Customers</h1>
      <p className="text-sm text-gray-600">Signed in as {email} · Shop #{shopId}</p>

      {customers.length === 0 ? (
        <p className="text-sm">No customers yet.</p>
      ) : (
        <ul className="divide-y border rounded">
          {customers.map((c: any) => (
            <li key={String(c._id)} className="p-3 space-y-1">
              <div className="font-medium">{c.name || '(no name)'}</div>
              <div className="text-sm text-gray-700">
                {c.email || '—'} · {c.phone || '—'} · ext: {c.externalId || '—'}
              </div>
              <div className="text-xs text-gray-500">
                {c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
