Here’s the full updated file (drop-in replace). I only changed the AF lookup to prefer the most recent **non-closed/non-appointment** event and fall back to the latest event if needed.

```tsx
// app/dashboard/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VEHICLE_HREF = (vin: string) => `/dashboard/vehicles/${encodeURIComponent(vin)}`;
const PLAN_HREF = (vin: string) => `/dashboard/vehicles/${encodeURIComponent(vin)}/plan`;
const RECOMMENDED_HREF = (vin: string) =>
  `/dashboard/recommended?vin=${encodeURIComponent(vin)}`;

type Row = {
  _id: string;
  updatedAt?: Date | string | null;
  af?: { status?: string; createdAt?: Date | string; miles?: number | null } | null;
  displayName: string | null;
  displayVehicle: string | null;
  displayVin: string | null;
  displayMiles: number | null;
  displayRo: string | null;
  dviDone: boolean;
};

function badgeClassFromStatus(s?: string) {
  const t = (s || "").toLowerCase();
  if (!t) return "bg-gray-100 text-gray-800";
  if (t.includes("close")) return "bg-green-100 text-green-800";
  if (t.includes("open")) return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-800";
}

export default async function DashboardPage() {
  // Session
  const store = await cookies();
  const sid = store.get("sid")?.value ?? store.get("session_token")?.value;
  if (!sid) redirect("/login");

  const db = await getDb();
  const sessions = db.collection("sessions");
  const users = db.collection("users");
  const now = new Date();

  const sess = await sessions.findOne({ token: sid, expiresAt: { $gt: now } });
  if (!sess) redirect("/login");

  const user = await users.findOne(
    { _id: sess.userId },
    { projection: { email: 1, role: 1, shopId: 1 } }
  );
  if (!user) redirect("/login");

  // Only non-closed customers
  const statusNotClosed = {
    $or: [{ status: { $exists: false } }, { status: null }, { status: { $ne: "closed" } }],
  };

  const rows = await db.collection("customers").aggregate<Row>([
    { $match: { $and: [{ $or: [{ shopId: String(user.shopId) }, { shopId: Number(user.shopId) }] }, statusNotClosed] } },

    // Latest vehicle
    {
      $lookup: {
        from: "vehicles",
        let: { cid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$cid"] } } },
          {
            $addFields: {
              vTime: {
                $cond: [
                  { $eq: [{ $type: "$updatedAt" }, "date"] },
                  "$updatedAt",
                  { $dateFromString: { dateString: { $toString: { $ifNull: ["$updatedAt", "$createdAt"] } }, onError: null, onNull: null } },
                ],
              },
            },
          },
          { $sort: { vTime: -1 } },
          { $limit: 1 },
          { $project: { year: 1, make: 1, model: 1, vin: 1, odometer: 1, lastMiles: 1 } },
        ],
        as: "vehicle",
      },
    },
    { $addFields: { vehicle: { $ifNull: [{ $arrayElemAt: ["$vehicle", 0] }, null] } } },

    // Latest repair order (mileage + RO# + YMM fallback)
    {
      $lookup: {
        from: "repair_orders",
        let: { cid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$cid"] } } },
          {
            $addFields: {
              roTime: {
                $cond: [
                  { $eq: [{ $type: "$updatedAt" }, "date"] },
                  "$updatedAt",
                  { $dateFromString: { dateString: { $toString: { $ifNull: ["$updatedAt", "$createdAt"] } }, onError: null, onNull: null } },
                ],
              },
            },
          },
          { $sort: { roTime: -1 } },
          { $limit: 1 },
          { $project: { roNumber: 1, mileage: 1, customer: 1, year: 1, make: 1, model: 1, vin: 1 } },
        ],
        as: "latestRO",
      },
    },
    { $addFields: { latestRO: { $ifNull: [{ $arrayElemAt: ["$latestRO", 0] }, null] } } },

    // Normalize customer updatedAt
    {
      $addFields: {
        updatedAt: {
          $cond: [
            { $eq: [{ $type: "$updatedAt" }, "date"] },
            "$updatedAt",
            { $dateFromString: { dateString: { $toString: { $ifNull: ["$updatedAt", "$createdAt"] } }, onError: null, onNull: null } },
          ],
        },
      },
    },

    // Compute display fields (name/vehicle/vin/miles/ro) with robust fallbacks
    {
      $addFields: {
        displayVin: { $ifNull: ["$vehicle.vin", "$latestRO.vin"] },

        displayName: {
          $let: {
            vars: {
              full: {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: ["$firstName", ""] },
                      { $cond: [{ $and: [{ $ifNull: ["$firstName", false] }, { $ifNull: ["$lastName", false] }] }, " ", ""] },
                      { $ifNull: ["$lastName", ""] },
                    ],
                  },
                },
              },
            },
            in: {
              $cond: [
                { $ne: ["$$full", ""] },
                "$$full",
                {
                  $ifNull: [
                    "$name",
                    {
                      $ifNull: [
                        "$latestRO.customer.name",
                        {
                          $let: {
                            vars: {
                              roFull: {
                                $trim: {
                                  input: {
                                    $concat: [
                                      { $ifNull: ["$latestRO.customer.firstname", ""] },
                                      {
                                        $cond: [
                                          {
                                            $and: [
                                              { $ifNull: ["$latestRO.customer.firstname", false] },
                                              { $ifNull: ["$latestRO.customer.lastname", false] },
                                            ],
                                          },
                                          " ",
                                          "",
                                        ],
                                      },
                                      { $ifNull: ["$latestRO.customer.lastname", ""] },
                                    ],
                                  },
                                },
                              },
                            },
                            in: { $cond: [{ $ne: ["$$roFull", ""] }, "$$roFull", null] },
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },

        displayVehicle: {
          $let: {
            vars: {
              vehicleLabel: {
                $trim: {
                  input: {
                    $concat: [
                      { $toString: { $ifNull: ["$vehicle.year", ""] } },
                      { $cond: [{ $ifNull: ["$vehicle.year", false] }, " ", ""] },
                      { $ifNull: ["$vehicle.make", ""] },
                      { $cond: [{ $ifNull: ["$vehicle.make", false] }, " ", ""] },
                      { $ifNull: ["$vehicle.model", ""] },
                    ],
                  },
                },
              },
            },
            in: {
              $cond: [
                { $ne: ["$$vehicleLabel", ""] },
                "$$vehicleLabel",
                {
                  $trim: {
                    input: {
                      $concat: [
                        { $toString: { $ifNull: ["$latestRO.year", ""] } },
                        { $cond: [{ $ifNull: ["$latestRO.year", false] }, " ", ""] },
                        { $ifNull: ["$latestRO.make", ""] },
                        { $cond: [{ $ifNull: ["$latestRO.make", false] }, " ", ""] },
                        { $ifNull: ["$latestRO.model", ""] },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },

        displayRo: { $ifNull: ["$latestRO.roNumber", null] },
        _milesFromRO: { $ifNull: ["$latestRO.mileage", null] },

        _milesFromVehicle: {
          $ifNull: [
            "$vehicle.odometer",
            { $ifNull: ["$vehicle.lastMiles", null] },
          ],
        },
      },
    },

    // Require name + VIN
    {
      $match: {
        displayName: { $type: "string", $ne: "" },
        displayVin: { $type: "string", $ne: "" },
      },
    },

    // Latest AF event per VIN with fallback:
    // - Prefer the most recent NON-closed/non-appointment event
    // - Fall back to the most recent event of any status
    {
      $lookup: {
        from: "events",
        let: { vinU: { $toUpper: "$displayVin" } },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ["$$vinU", ""] },
                  {
                    $eq: [
                      {
                        $toUpper: {
                          $ifNull: ["$vehicleVin", { $ifNull: ["$vin", "$payload.vehicle.vin"] }],
                        },
                      },
                      "$$vinU",
                    ],
                  },
                  {
                    $or: [
                      { $eq: ["$provider", "autoflow"] },
                      { $and: [{ $eq: ["$provider", "ui"] }, { $eq: ["$type", "manual_closed"] }] },
                    ],
                  },
                ],
              },
            },
          },
          {
            $addFields: {
              createdAtDate: {
                $cond: [
                  { $eq: [{ $type: "$createdAt" }, "date"] },
                  "$createdAt",
                  { $dateFromString: { dateString: { $toString: "$createdAt" }, onError: null, onNull: null } },
                ],
              },
              statusRaw: {
                $ifNull: [
                  "$payload.ticket.status",
                  { $ifNull: ["$status", { $ifNull: ["$payload.status", "$type"] }] },
                ],
              },
            },
          },
          { $sort: { createdAtDate: -1 } },
          {
            $facet: {
              open: [
                { $match: { statusRaw: { $not: /close|appoint/i } } },
                { $limit: 1 },
              ],
              any: [{ $limit: 1 }],
            },
          },
          {
            $project: {
              chosen: {
                $cond: [
                  { $gt: [{ $size: "$open" }, 0] },
                  { $arrayElemAt: ["$open", 0] },
                  { $arrayElemAt: ["$any", 0] },
                ],
              },
            },
          },
          {
            $project: {
              _id: 0,
              createdAt: "$chosen.createdAtDate",
              status: {
                $cond: [
                  { $and: [{ $eq: ["$chosen.provider", "ui"] }, { $eq: ["$chosen.type", "manual_closed"] }] },
                  "Closed",
                  "$chosen.statusRaw",
                ],
              },
              miles: {
                $ifNull: [
                  "$chosen.payload.ticket.mileage",
                  {
                    $ifNull: [
                      "$chosen.payload.mileage",
                      {
                        $ifNull: [
                          "$chosen.payload.vehicle.mileage",
                          {
                            $ifNull: [
                              "$chosen.payload.vehicle.miles",
                              { $ifNull: ["$chosen.payload.vehicle.odometer", null] },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        as: "af",
      },
    },
    { $addFields: { af: { $ifNull: [{ $arrayElemAt: ["$af", 0] }, null] } } },

    // DVI presence for latest RO
    {
      $lookup: {
        from: "dvi_results",
        let: { ro: "$displayRo" },
        pipeline: [
          { $match: { $expr: { $and: [{ $ne: ["$$ro", null] }, { $eq: ["$roNumber", "$$ro"] }] } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "dviRes",
      },
    },
    {
      $lookup: {
        from: "dvi",
        let: { ro: "$displayRo" },
        pipeline: [
          { $match: { $expr: { $and: [{ $ne: ["$$ro", null] }, { $eq: ["$roNumber", "$$ro"] }] } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "dviAlt",
      },
    },
    { $addFields: { dviDone: { $gt: [{ $size: { $concatArrays: ["$dviRes", "$dviAlt"] } }, 0] } } },

    // Best available mileage: RO → AF → Vehicle
    {
      $addFields: {
        displayMiles: {
          $let: {
            vars: {
              m1: "$_milesFromRO",
              m2: "$af.miles",
              m3: "$_milesFromVehicle",
            },
            in: {
              $cond: [
                { $and: [{ $ne: ["$$m1", null] }, { $gt: ["$$m1", 0] }] },
                "$$m1",
                {
                  $cond: [
                    { $and: [{ $ne: ["$$m2", null] }, { $gt: ["$$m2", 0] }] },
                    "$$m2",
                    {
                      $cond: [
                        { $and: [{ $ne: ["$$m3", null] }, { $gt: ["$$m3", 0] }] },
                        "$$m3",
                        null,
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    },

    // Hide Closed and Appointment statuses
    {
      $match: {
        $and: [
          { $or: [{ "af.status": { $exists: false } }, { "af.status": { $not: /close/i } }] },
          { $or: [{ "af.status": { $exists: false } }, { "af.status": { $not: /appoint/i } }] },
        ],
      },
    },

    // Freshness sort
    {
      $addFields: {
        sortKey: {
          $cond: [{ $gt: ["$updatedAt", "$af.createdAt"] }, "$updatedAt", "$af.createdAt"],
        },
      },
    },
    { $sort: { sortKey: -1 } },

    // Final projection
    {
      $project: {
        _id: 1,
        updatedAt: 1,
        af: 1,
        displayName: 1,
        displayVehicle: 1,
        displayVin: 1,
        displayMiles: 1,
        displayRo: 1,
        dviDone: 1,
      },
    },
  ]).toArray();

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="space-y-1 text-sm">
          <div>Email: <code>{user.email}</code></div>
          <div>Role: <code>{user.role}</code></div>
          <div>Shop ID: <code>{String(user.shopId ?? "—")}</code></div>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent Vehicles / Customers</h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3 w-10">{/* X */}</th>
                <th className="p-3">Name</th>
                <th className="p-3">RO #</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">VIN</th>
                <th className="p-3">AF Status</th>
                <th className="p-3">DVI</th>
                <th className="p-3">Odometer</th>
                <th className="p-3">Updated</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vin = r.displayVin || "";
                const statusText = r.af?.status || "Unknown";
                const badge = badgeClassFromStatus(statusText);

                return (
                  <tr key={r._id} className="border-t hover:bg-gray-50">
                    {/* Manual Close (left X) — dashboard redirect */}
                    <td className="p-3 align-middle">
                      <form
                        method="post"
                        action={`/api/vehicle/close/${encodeURIComponent(vin)}?redirect=/dashboard`}
                      >
                        <button
                          aria-label="Manual Close"
                          title="Manual Close"
                          className="rounded-full border w-6 h-6 leading-5 text-center hover:bg-gray-100"
                        >
                          ×
                        </button>
                      </form>
                    </td>

                    {/* Name (links to vehicle page) */}
                    <td className="p-3">
                      <a className="text-blue-600 hover:underline" href={VEHICLE_HREF(vin)}>
                        {r.displayName}
                      </a>
                    </td>

                    {/* RO # */}
                    <td className="p-3">{r.displayRo ? <code>{r.displayRo}</code> : "—"}</td>

                    {/* Vehicle */}
                    <td className="p-3">{r.displayVehicle && r.displayVehicle.trim() !== "" ? r.displayVehicle : "-"}</td>

                    {/* VIN */}
                    <td className="p-3">
                      <a className="text-blue-600 hover:underline" href={VEHICLE_HREF(vin)}>
                        <code>{vin}</code>
                      </a>
                    </td>

                    {/* AF Status */}
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${badge}`}>
                        {statusText}
                      </span>
                      {r.af?.createdAt ? (
                        <span className="ml-2 text-xs text-gray-500">
                          {new Date(r.af.createdAt as any).toLocaleString()}
                        </span>
                      ) : null}
                    </td>

                    {/* DVI */}
                    <td className="p-3">{r.dviDone ? "✅" : "⏹️"}</td>

                    {/* Miles */}
                    <td className="p-3">
                      {r.displayMiles != null ? (Number(r.displayMiles).toLocaleString?.() ?? r.displayMiles) : "—"}
                    </td>

                    {/* Updated */}
                    <td className="p-3">{r.updatedAt ? new Date(r.updatedAt as any).toLocaleString() : "—"}</td>

                    {/* Inspect / Plan / Recommended */}
                    <td className="p-3">
                      <div className="flex gap-2">
                        <a
                          href={VEHICLE_HREF(vin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border px-2 py-1 hover:bg-gray-100"
                          title="Open vehicle page"
                        >
                          Inspect
                        </a>
                        <a
                          href={PLAN_HREF(vin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border px-2 py-1 hover:bg-gray-100"
                          title="Open maintenance plan"
                        >
                          Plan
                        </a>
                        <a
                          href={RECOMMENDED_HREF(vin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border px-2 py-1 hover:bg-gray-100"
                          title="Open AI recommendations"
                        >
                          Recommended
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-gray-500" colSpan={10}>
                    No open customers with vehicle info to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500">
          AF Status (and mileage, when available) come from the latest AutoFlow event’s{" "}
          <code>payload.ticket.status</code>/<code>payload.ticket.mileage</code> (with fallbacks to other fields).
          Miles fall back to RO mileage, then any vehicle odometer fields. “Appointment” items are hidden here until they progress.
        </p>
      </section>

      <form action="/api/auth/logout" method="post">
        <button className="rounded bg-black text-white px-4 py-2">Log out</button>
      </form>
    </main>
  );
}
```
