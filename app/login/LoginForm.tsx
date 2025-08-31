"use client";

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
    setBusy(true);
    setMsg("");
    try {
      const body: any = { email, password };
      if (shopId.trim()) body.shopId = Number(shopId.trim());
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Login failed");
      // Go to dashboard (you can change this later)
      window.location.href = data.redirect || "/dashboard";
    } catch (err: any) {
      setMsg("❌ " + (err?.message || String(err)));
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
        required
      />
      <input
        type="password"
        className="w-full border rounded p-2"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      {/* Optional if you expect duplicate emails across shops */}
      <input
        type="text"
        className="w-full border rounded p-2"
        placeholder="Shop ID (optional)"
        value={shopId}
        onChange={(e) => setShopId(e.target.value)}
        inputMode="numeric"
      />

      <button
        type="submit"
        disabled={busy || !email || !password}
        className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {msg && <div className="text-sm whitespace-pre-wrap">{msg}</div>}
    </form>
  );
}
