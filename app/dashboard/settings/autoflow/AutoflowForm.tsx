"use client";

import { useState, useTransition } from "react";

type Props = {
  shopId: number;
  initial: { autoflowDomain: string; autoflowApiKey: string; autoflowApiPassword?: string };
};

export default function AutoflowForm({ shopId, initial }: Props) {
  const [autoflowDomain, setAutoflowDomain] = useState(initial.autoflowDomain || "");
  const [autoflowApiKey, setAutoflowApiKey] = useState(initial.autoflowApiKey || "");
  const [autoflowApiPassword, setAutoflowApiPassword] = useState(initial.autoflowApiPassword || "");
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await fetch("/api/settings/autoflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, autoflowDomain, autoflowApiKey, autoflowApiPassword }),
      });
      let data: any = {};
      try { data = await res.json(); } catch {}
      setMsg(res.ok ? "Saved!" : (data?.error ?? "Save failed"));
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Autoflow Domain</label>
        <input
          className="w-full border rounded px-3 py-2"
          value={autoflowDomain}
          onChange={(e) => setAutoflowDomain(e.target.value)}
          placeholder="carexpertsok.autotext.me"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Autoflow API Key</label>
        <input
          className="w-full border rounded px-3 py-2"
          value={autoflowApiKey}
          onChange={(e) => setAutoflowApiKey(e.target.value)}
          placeholder="Your API key"
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Autoflow API Password</label>
        <input
          type="password"
          className="w-full border rounded px-3 py-2"
          value={autoflowApiPassword}
          onChange={(e) => setAutoflowApiPassword(e.target.value)}
          placeholder="Your API password"
          autoComplete="new-password"
        />
        <p className="text-xs text-neutral-600 mt-1">
          Used for Basic auth: base64(api_key:api_password)
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save"}
      </button>

      {msg && <p className="text-sm">{msg}</p>}
    </form>
  );
}
