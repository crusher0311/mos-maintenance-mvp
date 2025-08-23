// /app/api/carfax/fetch/[vin]/route.ts
import { NextRequest, NextResponse } from "next/server";

type CarfaxError = { code: number; message: string };
type CarfaxResp = {
  carfaxRequest?: { vin: string; productDataId: string; locationId: string };
  errorMessages?: { errors?: CarfaxError[] };
  serviceHistory?: {
    displayRecords?: Array<{ displayDate: string; odometer?: string; type: string; text: string[] }>;
  };
};

const POST_URL = process.env.CARFAX_POST_URL!;
const PDI = process.env.CARFAX_PRODUCT_DATA_ID!;
const DEFAULT_LOCATION = process.env.CARFAX_LOCATION_ID || "";
const FALLBACK_LOCATION = process.env.CARFAX_FALLBACK_LOCATION_ID || "";

// Temporary debug logs – will print to your Next.js terminal
console.log("CARFAX_POST_URL:", POST_URL);
console.log("CARFAX_PDI length:", PDI?.length);
console.log("CARFAX_LOCATION_ID:", DEFAULT_LOCATION);
console.log("CARFAX_FALLBACK_LOCATION_ID:", FALLBACK_LOCATION);

const is16 = (s?: string) => !!s && s.length === 16;
const parseOdo = (s?: string) => (s ? parseInt(s.replace(/[^0-9]/g, ""), 10) : undefined);
const sortByDateDesc = <T extends { displayDate?: string }>(recs: T[]) =>
  [...recs].sort((a, b) => new Date(b.displayDate || 0).getTime() - new Date(a.displayDate || 0).getTime());

async function callCarfax(vin: string, locationId: string) {
  const res = await fetch(POST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vin, productDataId: PDI, locationId }),
  });
  const json = (await res.json()) as CarfaxResp;
  return { status: res.status, json };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> }
) {
  // ✅ Await params (Next.js 15+ requirement)
  const { vin } = await params;
  const cleanVin = vin?.trim();

  const url = new URL(req.url);
  const locationFromQuery = url.searchParams.get("locationId")?.trim();
  const shopId = url.searchParams.get("shopId")?.trim();

  // TODO: update this if you want shopId → locationId mapping
  const mappedLocation = shopId ? mapShopToLocation(shopId) : undefined;

  const locationId = locationFromQuery || mappedLocation || DEFAULT_LOCATION;

  if (!cleanVin || cleanVin.length !== 17) {
    return NextResponse.json({ error: "Invalid VIN" }, { status: 400 });
  }
  if (!POST_URL || !is16(PDI) || !locationId) {
    return NextResponse.json(
      { error: "Server misconfigured: check CARFAX_POST_URL, CARFAX_PRODUCT_DATA_ID(16), CARFAX_LOCATION_ID" },
      { status: 500 }
    );
  }

  // 1st attempt
  let { status, json } = await callCarfax(cleanVin, locationId);

  // Retry if 302
  const has302 =
    json?.errorMessages?.errors?.some((e) => e.code === 302) ||
    /User does not have access to this Product/i.test(JSON.stringify(json?.errorMessages));

  if (has302 && FALLBACK_LOCATION && FALLBACK_LOCATION !== locationId) {
    const retry = await callCarfax(cleanVin, FALLBACK_LOCATION);
    status = retry.status;
    json = retry.json;
  }

  // Normalize displayRecords
  if (json?.serviceHistory?.displayRecords) {
    const sorted = sortByDateDesc(json.serviceHistory.displayRecords).map((r) => ({
      ...r,
      odometerNum: parseOdo(r.odometer),
    }));
    json.serviceHistory.displayRecords = sorted;
  }

  return NextResponse.json(json, { status: 200 });
}

// Optional GET handler so you can test in a browser or with irm GET
export async function GET(req: Request, ctx: any) {
  return POST(req as any, ctx);
}

function mapShopToLocation(shopId: string): string | undefined {
  const table: Record<string, string> = {
    // "68a91c4ed4def065c1dfcc77": "U4K2O3YEOX",  // Example mapping
  };
  return table[shopId];
}
