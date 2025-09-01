"use client";

import { useEffect, useState } from "react";

type EventRow = {
  id: string;
  ts: string | Date;
  provider: string;
  event: string;
  preview: string;
  payload: any;
};

export default function EventsPage() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [limit, setLimit] = useState(50);
  const [auto, setAuto] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/events/list?limit=${limit}`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setItems(data.events || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (!auto) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, auto]);

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Webhook Console</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-1">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto-refresh
          </label>
          <select
            className="border rounded p-1 text-sm"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[20, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            onClick={load}
            className="rounded bg-black text-white px-3 py-1.5 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {error && <div className="text-sm text-red-600">Error: {error}</div>}

      <div className="rounded-2xl border divide-y">
        <div className="grid grid-cols-4 gap-2 text-xs font-semibold p-3 bg-gray-50">
          <div>Time</div>
          <div>Provider</div>
          <div>Event</div>
          <div>Preview</div>
        </div>

        {items.map((e) => {
          const id = e.id;
          const isOpen = !!expanded[id];
          const ts = new Date(e.ts);
          const when = ts.toLocaleString();

          return (
            <div key={id} className="p-3">
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div className="truncate">{when}</div>
                <div className="truncate">{e.provider}</div>
                <div className="truncate">{e.event}</div>
                <div className="truncate">{e.preview}</div>
              </div>

              <div className="mt-2 flex gap-3">
                <button
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
                  }
                  className="text-xs underline"
                >
                  {isOpen ? "Hide JSON" : "Show JSON"}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(e.payload, null, 2));
                  }}
                  className="text-xs underline"
                >
                  Copy JSON
                </button>
              </div>

              {isOpen && (
                <pre className="mt-2 text-xs bg-gray-50 p-3 rounded overflow-auto max-h-64">
{JSON.stringify(e.payload, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500">
        Shows the most recent events for your shop. Use this to verify webhook delivery from AutoFlow.
      </p>
    </main>
  );
}
