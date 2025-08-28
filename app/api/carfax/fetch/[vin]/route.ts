// /app/api/carfax/fetch/[vin]/route.ts
import { NextRequest, NextResponse } from "next/server";

type CarfaxError = { code: number; message: string };
type CarfaxResp = {
  carfaxRequest?: {
    requestTime?: number;
    vin: string;
    productDataId: string;
    locationId: string;
  };
  errorMessages?: { errors?: CarfaxError[] } | Record<string, never>;
  serviceHistory?: {
    vin?: string;
    make?: string;
    model?: string;
    year?: string;
    numberOfServiceRecords?: number;
    numberOfRecallRecords?: number;
    serviceCategories?: Array<{
      serviceName: string;
      dateOfLastService?: string;
      odometerOfLastService?: number;
    }>;
    displayRecords?: Array<{
      displayDate: string;
      odometer?: string;
      type: string; // "service" | "recall" | ...
      text: string[];
    }>;
  };
};

const POST_URL = process.env.CARFAX_POST_URL || "";
const PDI_ENV = process.env.CARFAX_PRODUCT_DATA_ID || ""; // must be 16 chars
const DEFAULT_LOCATION = process.env.CARFAX_LOCATION_ID || "";
const FALLBACK_LOCATION = process.env.CARFAX_FALLBACK_LOCATION_ID || "";
const ALLOW_OVERRIDES = (process.env.CARFAX_ALLOW_OVERRIDES || "") === "1";

const is16 = (s?: string) => !!s && s.length === 16;
const parseOdo = (s?: string) => (s ? parseInt(s.replace(/[^0-9]/g, ""), 10) : undefined);
const sortByDateDesc = <T extends { displayDate?: string }>(recs: T[]) =>
  [...recs].sort(
    (a, b) =>
      new Date(b.displayDate || 0).getTime() - new Date(a.displayDate || 0).getTime()
  );

async function callCarfax(vin: string, productDataId: string, locationId: string) {
  const res = await fetch(POST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vin, productDataId, locationId }),
  });
  const json = (await res.json()) as CarfaxResp;
  return { status: res.status, json };
}

function hasErrorCode(resp: CarfaxResp, code: number) {
  const errs = resp?.errorMessages as any;
  const list: CarfaxError[] | undefined =
    errs?.errors && Array.isArray(errs.errors) ? errs.errors : undefined;
  if (list?.some((e) => e.code === code)) return true;
  const flat = JSON.stringify(errs || {});
  if (code === 302 && /User does not have access to this Product/i.test(flat)) return true;
  return false;
}

function mapShopToLocation(shopId: string): string | undefined {
  const table: Record<string, string> = {
    // Example:
    // "68a91c4ed4def065c1dfcc77": "U4K2O3YEOX",
  };
  return table[shopId];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> }
) {
  // Next 15 params are async
  const { vin: vinParam } = await params;
  const cleanVin = (vinParam || "").trim().toUpperCase();

  // Optional JSON body (used only when overrides are allowed)
  const body = await req.json().catch(() => ({})) as Partial<{
    vin: string;
    productDataId: string;
    locationId: string;
  }>;

  // Query params
  const url = new URL(req.url);
  const raw = ["1", "true", "yes"].includes((url.searchParams.get("raw") || "").toLowerCase());
  const locationFromQuery = url.searchParams.get("locationId")?.trim();
  const shopId = url.searchParams.get("shopId")?.trim();
  const mappedLocation = shopId ? mapShopToLocation(shopId) : undefined;

  // Choose identifiers
  const vin = cleanVin; // path param wins
  const productDataId =
    (ALLOW_OVERRIDES && body.productDataId) ? body.productDataId.trim() : PDI_ENV;
  const locationId =
    (ALLOW_OVERRIDES && body.locationId?.trim()) ||
    locationFromQuery ||
    mappedLocation ||
    DEFAULT_LOCATION;

  // Basic validation
  if (!vin || vin.length !== 17) {
    return NextResponse.json({ errorMessages: { errors: [{ code: 107, message: "The VIN provided is not valid. Reasons may include, not 17 characters or includes special characters." }] } }, { status: 200 });
  }
  if (!POST_URL || !is16(productDataId) || !locationId) {
    return NextResponse.json(
      {
        errorMessages: {
          errors: [
            {
              code: 500,
              message:
                "Server misconfigured. Check CARFAX_POST_URL, CARFAX_PRODUCT_DATA_ID (16 chars), CARFAX_LOCATION_ID.",
            },
          ],
        },
      },
      { status: 200 }
    );
  }

  // First attempt
  let { json } = await callCarfax(vin, productDataId, locationId);

  // 302 → try fallback location if configured and different
  if (hasErrorCode(json, 302) && FALLBACK_LOCATION && FALLBACK_LOCATION !== locationId) {
    const retry = await callCarfax(vin, productDataId, FALLBACK_LOCATION);
    json = retry.json;
  }

  // raw passthrough: exactly as CARFAX responded
  if (raw) {
    return NextResponse.json(json, { status: 200 });
  }

  // Otherwise, normalize a bit for UI convenience
  const cloned: CarfaxResp = JSON.parse(JSON.stringify(json));

  if (cloned?.serviceHistory?.displayRecords) {
    cloned.serviceHistory.displayRecords = sortByDateDesc(cloned.serviceHistory.displayRecords).map((r) => ({
      ...r,
      odometerNum: parseOdo(r.odometer),
    })) as any;
  }

  return NextResponse.json(cloned, { status: 200 });
}

// Optional GET handler so you can test in a browser or with irm GET
export async function GET(req: Request, ctx: any) {
  return POST(req as any, ctx);
}
