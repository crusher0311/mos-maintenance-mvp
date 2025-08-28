import { prisma } from "@/lib/prisma"; // If this errors, use: import { prisma } from "../../../lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function badgeColor(status: string) {
  switch (status.toLowerCase()) {
    case "overdue": return "bg-red-100 text-red-800";
    case "due": return "bg-amber-100 text-amber-800";
    case "coming_soon": return "bg-blue-100 text-blue-800";
    case "not_yet": return "bg-gray-100 text-gray-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

export default async function VehiclePage(props: {
  params: Promise<{ vin: string }>;
}) {
  // Next.js 15: params is a Promise
  const { vin: vinParam } = await props.params;
  const vin = vinParam.toUpperCase();

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
    include: {
      recommendations: { orderBy: { updatedAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!vehicle) return notFound();

  // Build analyzer link, include odometer if we have it
  const odoQS = vehicle.odometer ? `?odometer=${vehicle.odometer}` : "";
  const analyzeHref = `/api/vehicle/analyze/${vin}${odoQS}`;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Vehicle • {vin}</h1>
        <div className="flex items-center gap-4">
          <a
            href={analyzeHref}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
            title="Run analyzer now and save recommendations"
          >
            Run analysis
          </a>
          <a href="/dashboard" className="text-blue-600 hover:underline">
            Back to dashboard
          </a>
        </div>
      </div>

      <section className="grid md:grid-cols-4 gap-4">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Year</div>
          <div className="text-xl font-semibold">{vehicle.year ?? "-"}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Make</div>
          <div className="text-xl font-semibold">{vehicle.make ?? "-"}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Model</div>
          <div className="text-xl font-semibold">{vehicle.model ?? "-"}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Odometer</div>
          <div className="text-xl font-semibold">
            {vehicle.odometer?.toLocaleString() ?? "-"}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recommendations</h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">Service</th>
                <th className="p-3">Status</th>
                <th className="p-3">Notes</th>
                <th className="p-3">Source</th>
                <th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {vehicle.recommendations.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.name}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${badgeColor(
                        r.status
                      )}`}
                    >
                      {r.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3">{r.notes ?? "-"}</td>
                  <td className="p-3">{r.source ?? "-"}</td>
                  <td className="p-3">
                    {new Date(r.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {!vehicle.recommendations.length && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    No recommendations yet. Try <a
                      href={analyzeHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >running analysis</a>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recent Events</h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">Type</th>
                <th className="p-3">Source</th>
                <th className="p-3">Snippet</th>
              </tr>
            </thead>
            <tbody>
              {vehicle.events.map((e) => {
                const typeLabel =
                  typeof (e as any).type === "string"
                    ? (e as any).type
                    : JSON.stringify((e as any).type);
                return (
                  <tr key={e.id} className="border-t">
                    <td className="p-3">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3">{typeLabel}</td>
                    <td className="p-3">{e.source ?? "-"}</td>
                    <td className="p-3 text-gray-600 truncate">
                      {JSON.stringify(e.payload).slice(0, 120)}...
                    </td>
                  </tr>
                );
              })}
              {!vehicle.events.length && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-500">
                    No events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
