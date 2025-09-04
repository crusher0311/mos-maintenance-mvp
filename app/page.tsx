"use client";

import { useState } from "react";

export default function Home() {
  const [shopName, setShopName] = useState("");
  const [shopId, setShopId] = useState("");
  const [webhookToken, setWebhookToken] = useState("");

  // AutoFlow-style creds
  const [apiKey, setApiKey] = useState("");
  const [apiPassword, setApiPassword] = useState("");
  const [apiBase, setApiBase] = useState("");

  const [adminToken, setAdminToken] = useState("");
  const [log, setLog] = useState<string>("");

  const logLine = (m: string) => setLog((prev) => `${m}\n${prev}`);

  // Build a copyable Webhook URL (client-side origin)
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BASE_URL || "";
  const webhookUrl = webhookToken
    ? `${baseUrl}/api/webhooks/autoflow/${webhookToken}`
    : "";

  // Create shop (parse { shop: {...} })
  async function createShop() {
    try {
      const res = await fetch("/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: shopName }),
      });
      const data = await res.json(); // { shop: { shopId, name, webhookToken } }
      if (!res.ok) throw new Error(JSON.stringify(data));
      const sid = data?.shop?.shopId;
      const wt = data?.shop?.webhookToken || "";
      if (!sid) throw new Error("Server did not return shop.shopId");

      setShopId(String(sid));
      setWebhookToken(wt);
      logLine(`✅ Shop created: ${sid}`);
    } catch (e: any) {
      logLine(`❌ Create Shop failed: ${e.message || e}`);
    }
  }

  // Save AutoFlow credentials
  async function saveCreds() {
    try {
      if (!shopId) throw new Error("Create or enter a Shop ID first");
      const body: Record<string, string> = { apiKey, apiPassword };
      if (apiBase) body.apiBase = apiBase;

      const res = await fetch(`/api/shops/${shopId}/credentials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      logLine(`✅ Credentials saved for shop ${shopId}`);
    } catch (e: any) {
      logLine(`❌ Save Creds failed: ${e.message || e}`);
    }
  }

  // Test webhook (sends a fake event directly to your endpoint)
  async function testWebhook() {
    try {
      const token = webhookToken || prompt("Enter webhook token") || "";
      if (!token) throw new Error("Webhook token required");
      const res = await fetch(`/api/webhooks/autoflow/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "test.event", data: { message: "hello" } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      logLine(`✅ Webhook OK: ${JSON.stringify(data)}`);
    } catch (e: any) {
      logLine(`❌ Webhook failed: ${e.message || e}`);
    }
  }

  // Admin: create DB indexes
  async function createIndexes() {
    try {
      if (!adminToken) throw new Error("Admin token required");
      const res = await fetch("/api/admin/db-indexes", {
        method: "POST",
        headers: { "X-Admin-Token": adminToken },
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt);
      logLine(`✅ DB Indexes: ${txt}`);
    } catch (e: any) {
      logLine(`❌ DB Indexes failed: ${e.message || e}`);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-bold">MOS Maintenance MVP</h1>

      {/* Create Shop */}
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-semibold">1) Create Shop</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded p-2"
            placeholder="Shop Name"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
          />
          <button className="rounded bg-black text-white px-4 py-2" onClick={createShop}>
            Create
          </button>
        </div>

        <div className="text-sm text-gray-700 space-y-1">
          <div>Shop ID: <code>{shopId}</code></div>
          <div>Webhook Token: <code>{webhookToken}</code></div>

          {/* Copyable Webhook URL for AutoFlow */}
          {webhookToken && (
            <div className="mt-2">
              <div className="font-medium">Webhook URL for AutoFlow:</div>
              <div className="flex gap-2 items-center">
                <input className="w-full border rounded p-2" value={webhookUrl} readOnly />
                <button
                  className="rounded bg-black text-white px-3 py-2"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(webhookUrl);
                      logLine("✅ Copied webhook URL");
                    } catch {
                      logLine("❌ Copy failed");
                    }
                  }}
                >
                  Copy
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Paste this into AutoFlow’s Webhook/Callback URL for this shop.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Credentials */}
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-semibold">2) Save AutoFlow Credentials</h2>
        <input
          className="w-full border rounded p-2"
          placeholder="Shop ID (or use above)"
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <input
            className="border rounded p-2"
            placeholder="API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <input
            className="border rounded p-2"
            placeholder="API Password"
            value={apiPassword}
            onChange={(e) => setApiPassword(e.target.value)}
          />
          <input
            className="border rounded p-2"
            placeholder="API Base (optional, e.g. https://api.autoflow.com)"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
          />
          <button className="self-start rounded bg-black text-white px-4 py-2" onClick={saveCreds}>
            Save
          </button>
        </div>
      </section>

      {/* Webhook */}
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-semibold">3) Test Webhook</h2>
        <button className="rounded bg-black text-white px-4 py-2" onClick={testWebhook}>
          Send Test Event
        </button>
      </section>

      {/* Admin */}
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-semibold">Admin (optional)</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded p-2"
            placeholder="X-Admin-Token"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
          />
          <button className="rounded bg-black text-white px-4 py-2" onClick={createIndexes}>
            Create DB Indexes
          </button>
        </div>
      </section>

      {/* Log */}
      <section className="rounded-2xl border p-5 space-y-2">
        <h2 className="text-lg font-semibold">Log</h2>
        <pre className="text-xs bg-gray-50 p-3 rounded max-h-64 overflow-auto whitespace-pre-wrap">
{log}
        </pre>
      </section>
    </main>
  );
}

