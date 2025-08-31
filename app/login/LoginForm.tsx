"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Optional: include Shop ID if the same email might exist on multiple shops
  const [shopId, setShopId] = useState<string>(""); // leave blank if not needed
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const emailTrim = email.trim().toLowerCase();
    const pwd = password; // don't trim passwords
    const shopIdNum = shopId.trim() ? Number(shopId.trim()) : undefined;

    setBusy(true);
    setMsg("");

    try {
      const body: Record<string, unknown> = { email: emailTrim, password: pwd };
      if (Number.isFinite(shopIdNum)) body.shopId = shopIdNum;

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Try to parse JSON either way for better error messaging
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ignore parse error; we'll fall back to a generic message
      }

      if (!res.ok) {
        const errMsg =
          (data && (data.error || data.message)) ||
          `Login failed (HTTP ${res.status})`;
        throw new Error(errMsg);
      }

      // Success: redirect to dashboard (or server-provided redirect)
      window.location.href = (data && data.redirect) || "/dashboard";
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
