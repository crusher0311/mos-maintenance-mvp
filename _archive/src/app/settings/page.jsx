"use client";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [form, setForm] = useState({
    autoflowBaseUrl: "",
    autoflowApiKey: "",
    autoflowApiPassword: "",
    autoflowApiHeader: "X-API-KEY",
    autoflowWebhookToken: "",
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = await res.json();
      setForm(f => ({
        ...f,
        autoflowBaseUrl: data.autoflowBaseUrl || "",
        autoflowApiHeader: data.autoflowApiHeader || "X-API-KEY",
      }));
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

  function input(label, key, props = {}) {
    return (
      <div>
        <label className="block text-sm font-medium">{label}</label>
        <input
          value={form[key]}
          onChange={e => setForm({ ...form, [key]: e.target.value })}
          className="mt-1 w-full border rounded-md px-3 py-2"
          {...props}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">🔐 Settings</h1>
      <form onSubmit={save} className="space-y-4">
        {input("Autoflow Base URL", "autoflowBaseUrl", { placeholder: "https://qc.autotext.me" })}
        {input("Autoflow API Key", "autoflowApiKey", { placeholder: "Your API key", type: "password" })}
        {input("Autoflow API Password (if required)", "autoflowApiPassword", { placeholder: "Your API password", type: "password" })}
        {input("Autoflow API Header (default X-API-KEY)", "autoflowApiHeader", { placeholder: "X-API-KEY" })}
        {input("Webhook Token (Security Key)", "autoflowWebhookToken", { placeholder: "e.g., Up0Qaiq1", type: "password" })}
        <button className="px-4 py-2 rounded-md bg-gray-900 text-white">Save</button>
      </form>
      {msg && <div className="text-sm text-gray-700">{msg}</div>}
      <p className="text-xs text-gray-500">Dev note: secrets stored in config.json (gitignored). For prod, use env vars.</p>
    </div>
  );
}
