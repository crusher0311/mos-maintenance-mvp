import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---- helpers ----
const toStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
const intParam = (v: string | null, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};
function extractVin(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const vin = decodeURIComponent(parts[parts.length - 1] || "");
  return vin.trim().toUpperCase();
}
async function getJson<T = any>(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

export async function POST(req: NextRequest) {
  try {
    const vin = extractVin(req);
    if (!vin || vin.length !== 17) {
      return NextResponse.json({ error: "VIN missing/invalid", vin }, { status: 400 });
    }

    const url = new URL(req.url);
    const schedule = (url.searchParams.get("schedule") || "normal").toLowerCase();
    const transRaw = (url.searchParams.get("trans") || "").toLowerCase();
    const trans = transRaw === "manual" ? "manual" : transRaw === "automatic" ? "automatic" : "";
    const horizonMiles = intParam(url.searchParams.get("horizonMiles"), 3000);
    const horizonMonths = intParam(url.searchParams.get("horizonMonths"), 2);

    // Pull odometer from query or DB
    let odometer = url.searchParams.has("odometer")
      ? intParam(url.searchParams.get("odometer"), 0)
      : 0;

    if (!odometer) {
      const v = await prisma.vehicle.findUnique({ where: { vin }, select: { odometer: true } });
      odometer = v?.odometer ?? 0;
    }

    // Call your existing analyzer route
    const analyzeUrl =
      `${url.origin}/api/maintenance/analyze/${encodeURIComponent(vin)}` +
      `?odometer=${odometer}` +
      `&schedule=${encodeURIComponent(schedule)}` +
      `&horizonMiles=${horizonMiles}` +
      `&horizonMonths=${horizonMonths}` +
      (trans ? `&trans=${encodeURIComponent(trans)}` : "");

    const res = await getJson<any>(analyzeUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "analyze_failed", status: res.status, body: res.body }, { status: 500 });
    }

    const items: Array<{ service: string; status: string }> =
      res.body?.analysis?.maintenance_comparison?.items ?? [];

    // Save as source: "analysis" (replace previous analysis recs)
    await prisma.$transaction(async (tx) => {
      // touch vehicle updatedAt & optionally odometer
      await tx.vehicle.upsert({
        where: { vin },
        create: { vin, odometer: odometer || null },
        update: { odometer: odometer || undefined },
      });

      await tx.serviceRecommendation.deleteMany({
        where: { vehicleVin: vin, source: "analysis" },
      });

      if (items.length) {
        await tx.serviceRecommendation.createMany({
          data: items.map((it) => ({
            vehicleVin: vin,
            name: toStr(it.service) || "Unnamed",
            status: toStr(it.status) || "not_yet",
            notes: null,
            source: "analysis",
          })),
        });
      }
    });

    // Return a handy summary
    const counts = items.reduce((acc: Record<string, number>, it) => {
      const k = toStr(it.status).toUpperCase() || "UNKNOWN";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ok: true,
      vin,
      used: { odometer, schedule, trans, horizonMiles, horizonMonths },
      saved: { total: items.length, counts },
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Error", stack: e?.stack }, { status: 500 });
  }
}

// convenience GET -> POST
export async function GET(req: NextRequest) {
  return POST(req);
}
