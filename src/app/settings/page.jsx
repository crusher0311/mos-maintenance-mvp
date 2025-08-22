"use client";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [form, setForm] = useState({
    autoflowBaseUrl: "",
    autoflowApiKey: "",
    autoflowWebhookToken: "",
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = await res.json();
      setForm({
        autoflowBaseUrl: data.autoflowBaseUrl || "",
        autoflowApiKey: "", // keep empty unless user types a new one
        autoflowWebhookToken: "", // same
      });
    })();
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg("Saving...");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setMsg(res.ok ? "Saved" : (data.error || "Error"));
    setTimeout(() => setMsg(""), 2000);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">🔐 Settings</h1>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Autoflow Base URL</label>
          <input
            value={form.autoflowBaseUrl}
            onChange={e => setForm({ ...form, autoflowBaseUrl: e.target.value })}
            className="mt-1 w-full border rounded-md px-3 py-2"
            placeholder="https://carexpertsok.autotext.me (example)"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Autoflow API Key</label>
          <input
            value={form.autoflowApiKey}
            onChange={e => setForm({ ...form, autoflowApiKey: e.target.value })}
            className="mt-1 w-full border rounded-md px-3 py-2"
            placeholder="Paste API key (stored locally in config.json)"
            type="password"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Webhook Token (shared secret)</label>
          <input
            value={form.autoflowWebhookToken}
            onChange={e => setForm({ ...form, autoflowWebhookToken: e.target.value })}
            className="mt-1 w-full border rounded-md px-3 py-2"
            placeholder="Any strong token you set in Autoflow"
            type="password"
          />
        </div>
        <button className="px-4 py-2 rounded-md bg-gray-900 text-white">Save</button>
      </form>
      {msg && <div className="text-sm text-gray-700">{msg}</div>}
      <p className="text-xs text-gray-500">
        Dev note: saved to <code>config.json</code> in the project root (gitignored). For production, move creds to environment variables.
      </p>
    </div>
  );
}
