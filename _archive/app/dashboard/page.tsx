import { prisma } from "@/lib/prisma";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [vehicles, recCounts] = await Promise.all([
    prisma.vehicle.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        vin: true,
        year: true,
        make: true,
        model: true,
        odometer: true,
        updatedAt: true,
      },
    }),
    prisma.serviceRecommendation.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  recCounts.forEach((r) => (counts[r.status.toUpperCase()] = r._count.status));

  return (
    <main className="p-6 space-y-6">
      {/* auto-refresh every 10s */}
      <AutoRefresh intervalMs={10000} />

      <h1 className="text-2xl font-semibold">Maintenance Dashboard</h1>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["OVERDUE", "DUE", "COMING_SOON", "NOT_YET"].map((k) => (
          <div key={k} className="rounded-2xl border p-4 shadow-sm">
            <div className="text-sm text-gray-500">{k.replace("_", " ")}</div>
            <div className="text-2xl font-bold">{counts[k] ?? 0}</div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recent Vehicles</h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">VIN</th>
                <th className="p-3">Year</th>
                <th className="p-3">Make</th>
                <th className="p-3">Model</th>
                <th className="p-3">Odometer</th>
                <th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.vin} className="border-t hover:bg-gray-50">
                  <td className="p-3">
                    <a
                      className="text-blue-600 hover:underline"
                      href={`/vehicle/${v.vin}`}
                    >
                      {v.vin}
                    </a>
                  </td>
                  <td className="p-3">{v.year ?? "-"}</td>
                  <td className="p-3">{v.make ?? "-"}</td>
                  <td className="p-3">{v.model ?? "-"}</td>
                  <td className="p-3">
                    {v.odometer?.toLocaleString() ?? "-"}
                  </td>
                  <td className="p-3">
                    {new Date(v.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {!vehicles.length && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gray-500">
                    No vehicles yet—send a webhook.
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
