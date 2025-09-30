// app/api/vehicle/analyze/[vin]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const toStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
const intParam = (v: string | null, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

async function getJson<T = any>(url: string): Promise<{ ok: boolean; status: number; body: T | any }> {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { ok: res.ok, status: res.status, body: parsed };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> }   // NOTE: await params (Next.js 15 requirement)
) {
  try {
    const { vin: rawVin } = await params;
    const vin = toStr(rawVin).trim().toUpperCase();
    if (vin.length !== 17) {
      return NextResponse.json({ error: "VIN must be 17 characters" }, { status: 400 });
    }

    const url = new URL(req.url);
    const odometer       = intParam(url.searchParams.get("odometer"), 0);
    const schedule       = (url.searchParams.get("schedule") || "normal").toLowerCase();
    const horizonMiles   = intParam(url.searchParams.get("horizonMiles"), 0);
    const horizonMonths  = intParam(url.searchParams.get("horizonMonths"), 0);

    // optional hints from query
    let year  = toStr(url.searchParams.get("year"));
    let make  = toStr(url.searchParams.get("make"));
    let model = toStr(url.searchParams.get("model"));

    const fuel        = toStr(url.searchParams.get("fuel"));
    const trans       = toStr(url.searchParams.get("trans"));
    const drivetrain  = toStr(url.searchParams.get("drivetrain"));
    const turbo       = toStr(url.searchParams.get("turbo"));
    const supercharged= toStr(url.searchParams.get("supercharged"));
    const cylinders   = toStr(url.searchParams.get("cylinders"));
    const liters      = toStr(url.searchParams.get("liters"));

    // Fill YMM from DB if missing
    if (!year || !make || !model) {
      const v = await prisma.vehicle.findUnique({
        where: { vin },
        select: { year: true, make: true, model: true },
      });
      if (v) {
        if (!year  && v.year  != null) year  = String(v.year);
        if (!make  && v.make)          make  = v.make;
        if (!model && v.model)         model = v.model;
      }
    }

    // Build analyzer URL and forward all hints we have
    const qs = new URLSearchParams({
      odometer: String(odometer || 0),
      schedule,
      horizonMiles: String(horizonMiles),
      horizonMonths: String(horizonMonths),
    });

    if (year) qs.set("year", year);
    if (make) qs.set("make", make);
    if (model) qs.set("model", model);
    if (fuel) qs.set("fuel", fuel);
    if (trans) qs.set("trans", trans);
    if (drivetrain) qs.set("drivetrain", drivetrain);
    if (turbo) qs.set("turbo", turbo);
    if (supercharged) qs.set("supercharged", supercharged);
    if (cylinders) qs.set("cylinders", cylinders);
    if (liters) qs.set("liters", liters);

    const analyzeUrl = `${url.origin}/api/maintenance/analyze/${encodeURIComponent(vin)}?${qs.toString()}`;
    const a = await getJson<any>(analyzeUrl);

    // If analyzer failed (e.g., 424: no services), bubble its status instead of 500
    if (!a.ok) {
      return NextResponse.json(
        { error: "analyze_failed", status: a.status, body: a.body },
        { status: a.status }
      );
    }

    return NextResponse.json(a.body, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: any) {
  return GET(req, ctx);
}
