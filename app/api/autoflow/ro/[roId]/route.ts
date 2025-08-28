// app/api/autoflow/ro/[roId]/route.ts
import { NextResponse } from "next/server";

/**
 * Purpose: Fetch a Repair Order from AutoFlow and normalize the 3 fields we need:
 * - vin
 * - mileage (number)
 * - roNumber
 *
 * Auth token source (checked in this order):
 *   1) in-memory (set by a future /api/autoflow/login route) -> g.__autoflow?.token
 *   2) env AUTOFLOW_BEARER
 *   3) query param ?token=...
 *
 * Endpoint base/path are configurable:
 *   AUTOFLOW_BASE      e.g. https://api.autoflow.com
 *   AUTOFLOW_RO_PATH   e.g. /api/v1/repair-orders/{id}
 *
 * Dev/demo mode:
 *   Add ?demo=1 to return a hard-coded sample without calling upstream.
 */

const AF_BASE =
  process.env.AUTOFLOW_BASE || process.env.NEXT_PUBLIC_AUTOFLOW_BASE || "";
const AF_RO_PATH = process.env.AUTOFLOW_RO_PATH || "/api/v1/repair-orders/{id}";
const AF_ENV_BEARER = process.env.AUTOFLOW_BEARER || "";

type UpstreamShape = any;

function buildRoUrl(roId: string) {
  const path = AF_RO_PATH.replace(/\{(id|roId)\}/gi, roId);
  if (!AF_BASE) return path; // if someone set a full URL in path
  return `${AF_BASE}${path}`;
}

function pick<T = any>(obj: any, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return undefined;
}

function toNumber(n: any): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const parsed = parseInt(n.replace(/[^0-9-]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeUpstream(roId: string, raw: UpstreamShape) {
  // Try a bunch of likely shapes/paths:
  const vin =
    pick(raw, "vin", "VIN", "vehicleVin") ??
    pick(raw?.vehicle, "vin", "VIN") ??
    pick(raw?.Vehicle, "vin", "VIN") ??
    null;

  const mileage =
    toNumber(
      pick(
        raw,
        "mileage",
        "odometer",
        "odometerReading",
        "currentMileage",
        "vehicleMileage"
      )
    ) ??
    toNumber(
      pick(
        raw?.vehicle,
        "mileage",
        "odometer",
        "odometerReading",
        "currentMileage"
      )
    ) ??
    toNumber(
      pick(
        raw?.Vehicle,
        "mileage",
        "odometer",
        "odometerReading",
        "currentMileage"
      )
    ) ??
    null;

  const roNumber =
    String(
      pick(
        raw,
        "roNumber",
        "repairOrderNumber",
        "ro",
        "invoiceNumber",
        "ticketNumber",
        "orderNumber",
      ) ??
        pick(raw?.repairOrder, "number", "id") ??
        roId
    ) || roId;

  return { roId, vin, mileage, roNumber, raw };
}

async function fetchAutoflow(roId: string, token: string) {
  const url = buildRoUrl(roId);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { ok: res.ok, status: res.status, body };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ roId: string }> } // Next.js 15 params are async
) {
  const { roId } = await ctx.params;
  const url = new URL(req.url);
  const demo = url.searchParams.get("demo") === "1";

  if (!roId) {
    return NextResponse.json({ error: "Missing roId" }, { status: 400 });
  }

  // Demo shortcut
  if (demo) {
    const demoRaw = {
      roNumber: roId,
      vehicle: { vin: "1FTFW1E64CFB09199", mileage: 199235 },
    };
    const norm = normalizeUpstream(roId, demoRaw);
    return NextResponse.json(
      { source: "demo", ...norm },
      { status: 200 }
    );
  }

  // Resolve token (in-memory → env → query)
  const g = globalThis as any;
  const memoryToken = g.__autoflow?.token || "";
  const queryToken = url.searchParams.get("token") || "";
  const token = memoryToken || AF_ENV_BEARER || queryToken;

  if (!AF_BASE && !/^https?:\/\//i.test(AF_RO_PATH)) {
    return NextResponse.json(
      { error: "Server misconfigured. Set AUTOFLOW_BASE or provide a full URL in AUTOFLOW_RO_PATH." },
      { status: 500 }
    );
  }

  if (!token) {
    return NextResponse.json(
      {
        error:
          "Missing AutoFlow auth token. Either (a) POST /api/autoflow/login first, (b) set AUTOFLOW_BEARER in .env.local, or (c) pass ?token=...",
      },
      { status: 401 }
    );
  }

  try {
    const upstream = await fetchAutoflow(roId, token);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Upstream error", status: upstream.status, body: upstream.body },
        { status: 502 }
      );
    }

    const norm = normalizeUpstream(roId, upstream.body);
    return NextResponse.json(
      {
        source: "autoflow",
        endpoint: buildRoUrl(roId),
        ...norm,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Network error", details: String(err) },
      { status: 500 }
    );
  }
}
