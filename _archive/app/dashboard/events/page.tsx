// /app/dashboard/events/page.tsx
import React from "react";
import { getMongo } from "@/lib/mongo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_NAME =
  process.env.MONGODB_DB || process.env.DB_NAME || "mos-maintenance-mvp";

async function getDb() {
  const client = await getMongo();
  return client.db(DB_NAME);
}

export default async function EventsPage() {
  const db = await getDb();
  const events = await db
    .collection("webhook_events")
    .find({}, {
      projection: {
        _id: 0,
        shopId: 1,
        source: 1,
        eventType: 1,
        receivedAt: 1,
        status: 1,
        "payload.id": 1,
      },
    })
    .sort({ receivedAt: -1 })
    .limit(100)
    .toArray();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Recent Webhook Events</h1>
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Shop</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Payload ID</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e: any, i: number) => (
              <tr key={`${e.shopId}-${e.receivedAt}-${i}`} className="border-t">
                <td className="px-3 py-2">{new Date(e.receivedAt ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2">{e.shopId ?? "â€”"}</td>
                <td className="px-3 py-2">{e.source ?? "â€”"}</td>
                <td className="px-3 py-2">{e.eventType ?? "â€”"}</td>
                <td className="px-3 py-2">{e?.payload?.id ?? "â€”"}</td>
                <td className="px-3 py-2">{e.status ?? "â€”"}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-slate-600" colSpan={6}>
                  No webhook events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-500">
        Showing latest 100 rows from <code className="font-mono">webhook_events</code>.
      </div>
    </div>
  );
}

