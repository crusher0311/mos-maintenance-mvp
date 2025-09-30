"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AutoflowLog = {
  token: string;
  receivedAt: string;
  payload?: any;
  raw?: string;
};

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
      logLine(`âœ… Shop created: ${sid}`);
    } catch (e: any) {
      logLine(`âŒ Create Shop failed: ${e.message || e}`);
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
      logLine(`âœ… Credentials saved for shop ${shopId}`);
    } catch (e: any) {
      logLine(`âŒ Save Creds failed: ${e.message || e}`);
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
      logLine(`âœ… Webhook OK: ${JSON.stringify(data)}`);
    } catch (e: any) {
      logLine(`âŒ Webhook failed: ${e.message || e}`);
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
      logLine(`âœ… DB Indexes: ${txt}`);
    } catch (e: any) {
      logLine(`âŒ DB Indexes failed: ${e.message || e}`);
    }
  }

  // ===== Recent AutoFlow Events (no-cache fetch) =====
  const [events, setEvents] = useState<AutoflowLog[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [limit, setLimit] = useState(25);

  const lastFetch = useRef<number>(0);

  const recentEndpoint = useMemo(() => {
    // Add a ts bust param to avoid any intermediary caches
    const ts = Date.now();
    return `/api/events/autoflow/recent?limit=${limit}&ts=${ts}`;
  }, [limit]);

  async function loadRecent(logSuccess = false) {
    try {
      setEventsLoading(true);
      lastFetch.current = Date.now();
      const res = await fetch(recentEndpoint, {
        // In-browser fetch: ask for no store; server route also sends Cache-Control: no-store
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || JSON.stringify(data));
      setEvents(Array.isArray(data?.logs) ? data.logs : []);
      if (logSuccess) logLine("âœ… Fetched recent AutoFlow events");
    } catch (e: any) {
      logLine(`âŒ Fetch recent events failed: ${e.message || e}`);
    } finally {
      setEventsLoading(false);
    }
  }

  useEffect(() => {
    // initial fetch
    loadRecent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentEndpoint]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => loadRecent(false), 7000);
    return () => clearInterval(id);
  }, [autoRefresh, recentEndpoint]);

  const fmt = (d?: string) =>
    d ? new Date(d).toLocaleString() : "";

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
          <div>
            Shop ID: <code>{shopId}</code>
          </div>
          <div>
            Webhook Token: <code>{webhookToken}</code>
          </div>

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
                      logLine("âœ… Copied webhook URL");
                    } catch {
                      logLine("âŒ Copy failed");
                    }
                  }}
                >
                  Copy
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Paste this into AutoFlowâ€™s Webhook/Callback URL for this shop.
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

      {/* Recent Events (no-cache) */}
      <section className="rounded-2xl border p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">4) Recent AutoFlow Events</h2>
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-1">
              <span className="text-gray-600">Limit</span>
              <select
                className="border rounded px-2 py-1"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 25)}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span className="text-gray-600">Auto refresh</span>
            </label>
            <button
              className="rounded bg-black text-white px-3 py-1.5"
              onClick={() => loadRecent(true)}
              disabled={eventsLoading}
              title="Fetches with cache: 'no-store' and a ts param"
            >
              {eventsLoading ? "Refreshingâ€¦" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Last fetch: {lastFetch.current ? new Date(lastFetch.current).toLocaleTimeString() : "â€”"}
        </div>

        {events.length === 0 ? (
          <div className="text-sm text-gray-600">No events found yet.</div>
        ) : (
          <div className="space-y-3">
            {events.map((e, i) => {
              const t = e?.payload?.text as string | undefined;
              const eventType = e?.payload?.event?.type as string | undefined;
              const cust =
                e?.payload?.customer
                  ? `${e.payload.customer.firstname ?? ""} ${e.payload.customer.lastname ?? ""}`.trim()
                  : "";
              const veh = e?.payload?.vehicle
                ? `${e.payload.vehicle.year ?? ""} ${e.payload.vehicle.make ?? ""} ${e.payload.vehicle.model ?? ""}`.trim()
                : "";
              return (
                <div key={i} className="rounded-xl border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        {t || eventType || "(event)"}{" "}
                        <span className="text-gray-500 font-normal">Â· token {e.token}</span>
                      </div>
                      <div className="text-gray-600">
                        {cust && <span>{cust}</span>}
                        {cust && veh && <span> Â· </span>}
                        {veh && <span>{veh}</span>}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{fmt(e.receivedAt)}</div>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs underline">Show JSON</summary>
                    <pre className="mt-1 max-h-64 overflow-auto bg-gray-50 p-2 rounded text-xs">
                      {JSON.stringify(e.payload ?? e, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
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


