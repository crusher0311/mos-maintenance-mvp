// app/api/autoflow/dvi/[dviId]/route.ts
import { NextResponse } from "next/server";

/** Fetch AutoFlow DVI by id, normalize vin / mileage / roNumber. */

const AF_BASE =
  process.env.AUTOFLOW_BASE || process.env.NEXT_PUBLIC_AUTOFLOW_BASE || "";
const AF_DVI_PATH = process.env.AUTOFLOW_DVI_PATH || "/api/v1/dvi/{id}";
const AUTH_MODE = (process.env.AUTOFLOW_AUTH || "basic").toLowerCase();

const BASIC_USER =
  process.env.AUTOFLOW_BASIC_USER || process.env.AUTOFLOW_USERNAME || "";
const BASIC_PASS =
  process.env.AUTOFLOW_BASIC_PASS || process.env.AUTOFLOW_PASSWORD || "";
const BEARER = process.env.AUTOFLOW_BEARER || "";

type Upstream = any;

function buildUrl(id: string) {
  const p = AF_DVI_PATH.replace(/\{(id|dviId)\}/gi, id);
  return AF_BASE ? `${AF_BASE}${p}` : p;
}

function authHeader(): Record<string, string> {
  if (AUTH_MODE === "basic") {
    if (!BASIC_USER || !BASIC_PASS)
      throw new Error("Missing AUTOFLOW_BASIC_USER/AUTOFLOW_BASIC_PASS");
    const token =
      typeof Buffer !== "undefined"
        ? Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString("base64")
        : btoa(`${BASIC_USER}:${BASIC_PASS}`);
    return { Authorization: `Basic ${token}` };
  }
  if (AUTH_MODE === "bearer") {
    if (!BEARER) throw new Error("Missing AUTOFLOW_BEARER");
    return { Authorization: `Bearer ${BEARER}` };
  }
  return {};
}

function toNumber(n: any): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const v = parseInt(n.replace(/[^0-9-]/g, ""), 10);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function pick(obj: any, ...keys: string[]) {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return undefined;
}

function normalize(dviId: string, raw: Upstream) {
  // AutoFlow DVI tends to wrap payload in { message, success, content: {...} }
  const c = raw?.content ?? raw;

  const vin =
    pick(c, "vin", "VIN") ??
    pick(c?.vehicle, "vin", "VIN") ??
    null;

  const mileage =
    toNumber(
      pick(c, "mileage", "odometer", "odometerReading") ??
        pick(c?.vehicle, "mileage", "odometer", "odometerReading")
    );

  const roNumber =
    String(
      pick(
        c,
        "ro_number",
        "roNumber",
        "ro",
        "repair_order_number",
        "ticketNumber",
        "invoice_number"
      ) ?? dviId
    ) || dviId;

  return { vin, mileage, roNumber, raw };
}

async function getDvi(dviId: string) {
  const url = buildUrl(dviId);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeader(),
  };

  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body, url };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ dviId: string }> }
) {
  const { dviId } = await ctx.params;
  if (!dviId) return NextResponse.json({ error: "Missing dviId" }, { status: 400 });

  if (!AF_BASE && !/^https?:\/\//i.test(AF_DVI_PATH)) {
    return NextResponse.json(
      { error: "Server misconfigured. Set AUTOFLOW_BASE or provide a full URL in AUTOFLOW_DVI_PATH." },
      { status: 500 }
    );
  }

  try {
    const up = await getDvi(dviId);
    if (!up.ok) {
      return NextResponse.json(
        { error: "Upstream error", status: up.status, url: up.url, body: up.body },
        { status: 502 }
      );
    }
    const norm = normalize(dviId, up.body);
    return NextResponse.json(
      { source: "autoflow-dvi", endpoint: up.url, dviId, ...norm },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Network error", details: String(e) },
      { status: 500 }
    );
  }
}
