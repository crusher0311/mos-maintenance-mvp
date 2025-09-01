// app/dashboard/customers/new/NewCustomerForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewCustomerForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [externalId, setExternalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          externalId: externalId.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }

      router.replace("/dashboard/customers");
    } catch (err: any) {
      setMsg("❌ " + (err?.message || "Failed to create customer"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Name</label>
        <input
          className="mt-1 w-full border rounded p-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          disabled={busy}
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Email</label>
        <input
          type="email"
          className="mt-1 w-full border rounded p-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          autoComplete="email"
          disabled={busy}
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Phone</label>
        <input
          className="mt-1 w-full border rounded p-2"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          disabled={busy}
        />
      </div>

      <div>
        <label className="block text-sm font-medium">External ID</label>
        <input
          className="mt-1 w-full border rounded p-2"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          placeholder="CRM / SMS / DMS ID"
          disabled={busy}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <Link
          href="/dashboard/customers"
          className="rounded border px-4 py-2 hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>

      {msg && (
        <div className="text-sm whitespace-pre-wrap" aria-live="polite">
          {msg}
        </div>
      )}
    </form>
  );
}
