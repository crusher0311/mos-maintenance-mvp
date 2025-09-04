// app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { analyzeMaintenance } from "@/lib/analyzer";
import { buildEvidenceForVIN } from "@/lib/evidence"; // <- implement: pulls DVI/CARFAX/OE

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const vin = req.nextUrl.searchParams.get("vin");
  if (!vin) return NextResponse.json({ error: "vin is required" }, { status: 400 });

  try {
    const ev = await buildEvidenceForVIN(vin);
    const analysis = await analyzeMaintenance(ev);
    return NextResponse.json(analysis);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
