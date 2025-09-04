// /app/dashboard/shops/page.tsx
import React from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function fetchShops() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/shops`, { cache: "no-store" });
  // Fallback if NEXT_PUBLIC_BASE_URL not set â€“ Next.js will upgrade to absolute automatically on server
  if (!res.ok) return { shops: [] };
  return res.json();
}

export default async function ShopsPage() {
  const { shops } = await fetchShops();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Shops</h1>

      <form
        className="rounded-xl border p-4 grid gap-3 bg-white"
        action="/api/shops"
        method="post"
      >
        <div className="text-sm font-medium">Create a shop</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input name="name" required placeholder="Shop Name" className="border rounded-lg px-3 py-2" />
          <input name="shopId" required placeholder="shop-id (letters, numbers, - _)" className="border rounded-lg px-3 py-2" />
          <input name="contactEmail" type="email" placeholder="contact@example.com" className="border rounded-lg px-3 py-2" />
        </div>
        <button className="rounded-lg border px-3 py-2 hover:bg-slate-50 w-fit" formMethod="dialog"
          onClick={async (e) => {
            // prevent default & submit via fetch so we can reload without leaving page
            e.preventDefault();
            const form = (e.currentTarget as HTMLButtonElement).form!;
            const fd = new FormData(form);
            const body = Object.fromEntries(fd.entries());
            const res = await fetch("/api/shops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            if (res.ok) location.reload();
            else alert((await res.json()).error ?? "Failed");
          }}>
          Create
        </button>
      </form>

      <div className="rounded-xl border overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Shop</th>
              <th className="px-3 py-2 text-left">shopId</th>
              <th className="px-3 py-2 text-left">Open</th>
            </tr>
          </thead>
          <tbody>
            {shops.map((s: any) => (
              <tr key={s.shopId} className="border-t">
                <td className="px-3 py-2">{s.name}</td>
                <td className="px-3 py-2">{s.shopId}</td>
                <td className="px-3 py-2">
                  <Link className="text-xs rounded-lg border px-3 py-1 hover:bg-slate-100"
                        href={`/dashboard/shops/${encodeURIComponent(s.shopId)}`}>
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
            {!shops.length && (
              <tr><td className="px-3 py-6 text-slate-600" colSpan={3}>No shops yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

