// app/dashboard/customers/[customerId]/vehicles/[vin]/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageParams = {
  customerId: string;
  vin: string;
};

export default async function VehiclePage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { shopId } = await requireSession();
  const db = await getDb();

  const vin = params.vin.toUpperCase();
  const customerId = params.customerId;

  // Latest ticket for RO#/status/miles
  const ticket = await db.collection("tickets").findOne(
    { shopId, vin },
    {
      sort: { updatedAt: -1 },
      projection: { roNumber: 1, mileage: 1, status: 1, updatedAt: 1 },
    }
  );

  // Vehicle basics (year/make/model/license)
  const vehicle = await db.collection("vehicles").findOne(
    { shopId, vin },
    {
      projection: { year: 1, make: 1, model: 1, license: 1 },
    }
  );

  // All DVI rows for this VIN (newest first) — now each row includes .lines[]
  const dviRows = await db
    .collection("dvi")
    .find({ shopId, vin })
    .sort({ fetchedAt: -1 })
    .toArray();

  const refreshed = searchParams?.refreshed === "1";

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="text-sm">
        <Link
          href={`/dashboard/customers/${encodeURIComponent(customerId)}`}
          className="underline"
        >
          ← Back to customer
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">
          {vehicle?.year ? `${vehicle.year} ` : ""}
          {vehicle?.make ? `${vehicle.make} ` : ""}
          {vehicle?.model ? vehicle.model : ""}
          {!(vehicle?.year || vehicle?.make || vehicle?.model) ? "Vehicle" : ""} · VIN: {vin}
        </h1>
        {vehicle?.license && (
          <div className="text-sm text-gray-700">Plate: {vehicle.license}</div>
        )}
        <div className="text-sm">
          RO#: {ticket?.roNumber ?? "—"} · Miles: {ticket?.mileage ?? "—"} · Status:{" "}
          {ticket?.status ?? "—"}{" "}
          {ticket?.updatedAt && <> (updated {new Date(ticket.updatedAt).toLocaleString()})</>}
        </div>

        {/* Refresh button (POST) */}
        <form
          method="POST"
          action={`/api/vehicles/${encodeURIComponent(vin)}/refresh`}
          className="mt-2"
        >
          <input type="hidden" name="shopId" value={String(shopId)} />
          <input type="hidden" name="customerId" value={customerId} />
          <button
            type="submit"
            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
            title="Fetch DVI (AutoFlow), VIN/OEM, Carfax, and run AI recommendations"
          >
            Refresh data (DVI · DataOne · Carfax · AI recommendations)
          </button>
          {refreshed && (
            <span className="ml-3 text-xs text-green-700 align-middle">Refreshed!</span>
          )}
        </form>
      </header>

      {/* Diagnostics & Recommendations placeholder */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Diagnostics &amp; Recommendations</h2>
        <p className="text-sm text-gray-700">
          After refresh, we’ll import DVI, OEM data (DataOne), and Carfax, then run our AI prompt to
          produce a service plan here.
        </p>
      </section>

      {/* DVI Findings */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">DVI Findings</h2>

        {dviRows.length === 0 ? (
          <p className="text-sm text-gray-700">
            No DVI results yet for this VIN. Click “Refresh data” to fetch from AutoFlow.
          </p>
        ) : (
          <ul className="divide-y border rounded">
            {dviRows.map((row: any) => (
              <li key={String(row._id)} className="p-3 space-y-2">
                <div className="text-sm">
                  <span className="font-medium">RO#:</span> {row.roNumber ?? "—"} ·{" "}
                  <span className="font-medium">Mileage:</span>{" "}
                  {Number.isFinite(row.mileage) ? row.mileage : "—"}
                  {row.sheetId && (
                    <>
                      {" "}· <span className="font-medium">Sheet ID:</span> {row.sheetId}
                    </>
                  )}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Vehicle:</span>{" "}
                  {[row.vehicle?.year, row.vehicle?.make, row.vehicle?.model]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </div>
                {row.notes && (
                  <div className="text-sm">
                    <span className="font-medium">Notes:</span>{" "}
                    <span className="whitespace-pre-wrap">{row.notes}</span>
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  Fetched {row.fetchedAt ? new Date(row.fetchedAt).toLocaleString() : ""}
                  {row.source ? ` · source: ${row.source}` : ""}
                </div>

                {/* Detailed lines */}
                {Array.isArray(row.lines) && row.lines.length > 0 && (
                  <div className="mt-2">
                    <div className="text-sm font-medium">Inspection Items</div>
                    <ul className="mt-1 space-y-1">
                      {row.lines.map((ln: any, i: number) => (
                        <li key={i} className="rounded border p-2">
                          <div className="text-sm">
                            {ln.section && (
                              <span className="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs">
                                {ln.section}
                              </span>
                            )}
                            <span className="font-medium">{ln.title || "(Untitled item)"}</span>
                          </div>
                          <div className="text-sm text-gray-700">
                            {ln.status && <>Status: {ln.status} · </>}
                            {ln.severity != null && <>Severity: {String(ln.severity)} · </>}
                            {ln.recommendation && <>Rec: {ln.recommendation}</>}
                          </div>
                          {ln.notes && (
                            <div className="text-sm">
                              <span className="font-medium">Notes:</span>{" "}
                              <span className="whitespace-pre-wrap">{ln.notes}</span>
                            </div>
                          )}
                          {(ln.estParts != null ||
                            ln.estLaborHours != null ||
                            ln.estTotal != null) && (
                            <div className="text-xs text-gray-600">
                              {ln.estParts != null && <>Parts: ${ln.estParts.toFixed(2)} · </>}
                              {ln.estLaborHours != null && <>Labor Hrs: {ln.estLaborHours} · </>}
                              {ln.estTotal != null && <>Est Total: ${ln.estTotal.toFixed(2)}</>}
                            </div>
                          )}
                          {Array.isArray(ln.photos) && ln.photos.length > 0 && (
                            <div className="mt-1 text-xs text-gray-600">
                              {ln.photos.length} photo(s) attached
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Debug: expand to see raw for troubleshooting */}
                {/* <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-600">Raw payload</summary>
                  <pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
                    {JSON.stringify(row.raw ?? row, null, 2)}
                  </pre>
                </details> */}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
