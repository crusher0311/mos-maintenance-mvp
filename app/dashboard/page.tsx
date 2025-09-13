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
  _id: string; // vin key
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

  // Build rows from latest AutoFlow events per VIN (hide closed/appointments)
  const rows = await db.collection("events").aggregate<Row>([
    {
      $match: {
        $and: [
          { $or: [{ shopId: String(user.shopId) }, { shopId: Number(user.shopId) }] },
          { provider: "autoflow" }
        ]
      }
    },
    // Normalize basic fields we need from events
    {
      $addFields: {
        createdAtDate: {
          $cond: [
            { $eq: [{ $type: "$createdAt" }, "date"] },
            "$createdAt",
            {
              $dateFromString: {
                dateString: { $toString: "$createdAt" },
                onError: null,
                onNull: null
              }
            }
          ]
        },
        statusRaw: {
          $ifNull: [
            "$payload.ticket.status",
            { $ifNull: ["$status", { $ifNull: ["$payload.status", "$type"] }] }
          ]
        },
        vinNorm: {
          $toUpper: {
            $ifNull: [
              "$vehicleVin",
              { $ifNull: ["$vin", "$payload.vehicle.vin"] }
            ]
          }
        }
      }
    },
    // Require VIN
    { $match: { vinNorm: { $type: "string", $ne: "" } } },
    // Sort by VIN asc, then time desc, so first in group is the latest per VIN
    { $sort: { vinNorm: 1, createdAtDate: -1 } },
    {
      $group: {
        _id: "$vinNorm",
        latest: { $first: "$$ROOT" }
      }
    },
    { $replaceRoot: { newRoot: "$latest" } },
    // Hide Closed and Appointment statuses
    { $match: { statusRaw: { $not: /close|appoint/i } } },
    // Compute display fields
    {
      $addFields: {
        // Name from payload; fallback to nested customer fields if used
        displayName: {
          $let: {
            vars: {
              full: {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: ["$payload.customer.firstname", ""] },
                      {
                        $cond: [
                          {
                            $and: [
                              { $ifNull: ["$payload.customer.firstname", false] },
                              { $ifNull: ["$payload.customer.lastname", false] }
                            ]
                          },
                          " ",
                          ""
                        ]
                      },
                      { $ifNull: ["$payload.customer.lastname", ""] }
                    ]
                  }
                }
              }
            },
            in: {
              $cond: [
                { $ne: ["$$full", ""] },
                "$$full",
                { $ifNull: ["$payload.customer.name", null] }
              ]
            }
          }
        },
        // Vehicle display from payload
        displayVehicle: {
          $trim: {
            input: {
              $concat: [
                { $toString: { $ifNull: ["$payload.vehicle.year", ""] } },
                { $cond: [{ $ifNull: ["$payload.vehicle.year", false] }, " ", ""] },
                { $ifNull: ["$payload.vehicle.make", ""] },
                { $cond: [{ $ifNull: ["$payload.vehicle.make", false] }, " ", ""] },
                { $ifNull: ["$payload.vehicle.model", ""] }
              ]
            }
          }
        },
        displayVin: "$vinNorm",
        displayRo: { $ifNull: ["$payload.ticket.roNumber", null] },
        af: {
          createdAt: "$createdAtDate",
          status: "$statusRaw",
          miles: {
            $ifNull: [
              "$payload.ticket.mileage",
              {
                $ifNull: [
                  "$payload.mileage",
                  {
                    $ifNull: [
                      "$payload.vehicle.mileage",
                      {
                        $ifNull: [
                          "$payload.vehicle.miles",
                          { $ifNull: ["$payload.vehicle.odometer", null] }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        },
        updatedAt: "$createdAtDate"
      }
    },
    // DVI presence using roNumber (if present)
    {
      $lookup: {
        from: "dvi_results",
        let: { ro: "$displayRo" },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $ne: ["$$ro", null] }, { $eq: ["$roNumber", "$$ro"] }] }
            }
          },
          { $limit: 1 },
          { $project: { _id: 1 } }
        ],
        as: "dviRes"
      }
    },
    {
      $lookup: {
        from: "dvi",
        let: { ro: "$displayRo" },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $ne: ["$$ro", null] }, { $eq: ["$roNumber", "$$ro"] }] }
            }
          },
          { $limit: 1 },
          { $project: { _id: 1 } }
        ],
        as: "dviAlt"
      }
    },
    { $addFields: { dviDone: { $gt: [{ $size: { $concatArrays: ["$dviRes", "$dviAlt"] } }, 0] } } },
    // Final projection
    {
      $project: {
        _id: 0,
        updatedAt: 1,
        af: 1,
        displayName: 1,
        displayVehicle: 1,
        displayVin: 1,
        displayMiles: "$af.miles",
        displayRo: 1,
        dviDone: 1
      }
    },
    // Sort newest first
    { $sort: { updatedAt: -1 } },
    // Limit to a reasonable count
    { $limit: 100 }
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
                  <tr key={vin} className="border-t hover:bg-gray-50">
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
                        {r.displayName || "—"}
                      </a>
                    </td>

                    {/* RO # */}
                    <td className="p-3">{r.displayRo ? <code>{r.displayRo}</code> : "—"}</td>

                    {/* Vehicle */}
                    <td className="p-3">
                      {r.displayVehicle && r.displayVehicle.trim() !== "" ? r.displayVehicle : "—"}
                    </td>

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
                      {r.displayMiles != null
                        ? (Number(r.displayMiles).toLocaleString?.() ?? r.displayMiles)
                        : "—"}
                    </td>

                    {/* Updated */}
                    <td className="p-3">
                      {r.updatedAt ? new Date(r.updatedAt as any).toLocaleString() : "—"}
                    </td>

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
          Miles fall back to other payload odometer fields. “Appointment” items are hidden here until they progress.
        </p>
      </section>

      <form action="/api/auth/logout" method="post">
        <button className="rounded bg-black text-white px-4 py-2">Log out</button>
      </form>
    </main>
  );
}
