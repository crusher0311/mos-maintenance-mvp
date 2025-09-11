// app/api/maintenance/debug/[vin]/route.ts
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

function extractVinFromUrl(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;                 // e.g., /api/maintenance/debug/1FT8...
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return { pathname, parts, vinFromPath: decodeURIComponent(last) };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> } // Next 15: params is a Promise
) {
  const { vin: vinParamRaw } = await params;
  const { pathname, parts, vinFromPath } = extractVinFromUrl(req);

  const vinParam = (vinParamRaw ?? "").trim().toUpperCase();
  const vinComputed = (vinParam || vinFromPath || "").trim().toUpperCase();

  return NextResponse.json({
    pathname,
    parts,
    query: new URL(req.url).searchParams.toString(),
    vinParam,
    vinFromPath,
    vinComputed,
    vinLength: vinComputed.length,
  });
}
