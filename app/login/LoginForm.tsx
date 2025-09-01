"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Optional: include Shop ID if the same email might exist on multiple shops
  const [shopId, setShopId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard/customers";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setMsg("");

    try {
      const body: Record<string, unknown> = {
        email: email.trim().toLowerCase(),
        password, // don't trim passwords
      };
      const sid = shopId.trim();
      if (sid) body.shopId = Number(sid);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ignore JSON parse errors
      }

      if (!res.ok) {
        const err =
          (data && (data.error || data.message)) ||
          `Login failed (HTTP ${res.status})`;
        throw new Error(err);
      }

      // Prefer server-provided redirect; else go to ?next or dashboard
      const dest = (data && data.redirect) || next || "/dashboard/customers";
      // Use client-side navigation
      router.replace(dest);
    } catch (err: any) {
      setMsg("❌ " + (err?.message || "Login failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        type="email"
        className="w-full border rounded p-2"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
        disabled={busy}
      />

      <input
        type="password"
        className="w-full border rounded p-2"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
        disabled={busy}
      />

      {/* Optional if you expect duplicate emails across shops */}
      <input
        type="text"
        className="w-full border rounded p-2"
        placeholder="Shop ID (optional)"
        value={shopId}
        onChange={(e) => setShopId(e.target.value)}
        inputMode="numeric"
        pattern="\d*"
        disabled={busy}
        title="If your email is used in more than one shop, enter your Shop ID."
      />

      <button
        type="submit"
        disabled={busy || !email || !password}
        className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <div className="mt-2 text-sm">
        <Link href="/forgot" className="underline hover:no-underline">
          Forgot password?
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
