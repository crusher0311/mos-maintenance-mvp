// app/lib/providers/autoflow.ts

export type DviSeverity = "red" | "yellow" | "green" | "na" | "unknown";

export type DviItem = {
  name: string;
  severity: DviSeverity; // red/yellow/green/na
  notes?: string;
};

export type DviReport = {
  vin?: string;
  roId?: string;
  ticketId?: string;
  plate?: string;
  items: DviItem[];
  fetchedAt?: string;
};

export type RoMeta = {
  vin?: string;
  mileage?: number | null;
  roNumber?: string;
  roId?: string;
  raw?: any; // keep for debugging
  fetchedAt?: string;
};

// --- ENV ---
const AUTOFLOW_BASE = process.env.AUTOFLOW_BASE || "";          // e.g. https://api.autoflow.com
const AUTOFLOW_API_KEY = process.env.AUTOFLOW_API_KEY || "";    // Bearer token / key
const AUTOFLOW_MOCK = (process.env.AUTOFLOW_MOCK || "0") === "1";

// --- Cache (1h) ---
type CacheEntry<T> = { at: number; data: T };
const HOUR = 60 * 60 * 1000;
const g = globalThis as any;
g.__dvi_cache ||= new Map<string, CacheEntry<DviReport>>();
g.__ro_cache ||= new Map<string, CacheEntry<RoMeta>>();
const DVI_CACHE: Map<string, CacheEntry<DviReport>> = g.__dvi_cache;
const RO_CACHE: Map<string, CacheEntry<RoMeta>> = g.__ro_cache;

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string, ttl = HOUR): T | null {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  return null;
}
function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, data: T) {
  map.set(key, { at: Date.now(), data });
}

// --- Canonical service dictionary (small & extendable) ---
const CANON: Record<string, string[]> = {
  "Change engine oil": ["oil", "engine oil", "oil change", "oil & filter", "oil and filter"],
  "Replace oil filter": ["oil filter"],
  "Replace air filter": ["air filter", "air cleaner"],
  "Transmission fluid": ["trans fluid", "transmission fluid", "atf", "mtf", "gear oil"],
  "Coolant / antifreeze": ["coolant", "antifreeze", "radiator"],
  "Brake system / pads / rotors": ["brake", "brakes", "pads", "rotors", "brake fluid", "hydraulic"],
  "Rotate wheels & tires": ["tire rotation", "rotate tires", "rotate"],
  "Battery / charging": ["battery", "charging", "alternator"],
  "Drive belt(s)": ["belt", "drive belt", "serpentine"],
  "PCV / emissions": ["pcv", "egr", "evap", "emissions"],
  "Spark plugs / ignition": ["spark plug", "ignition", "coil"],
  "Suspension / steering": ["suspension", "strut", "shock", "steering", "tie rod", "boot"],
};

function toCanonKey(label: string): keyof typeof CANON | undefined {
  const s = (label || "").toLowerCase();
  for (const [canon, terms] of Object.entries(CANON)) {
    if (terms.some(t => s.includes(t))) return canon as keyof typeof CANON;
  }
  return undefined;
}

// --- Helpers ---
function stripNum(x: any): number | null {
  if (x == null) return null;
  const n = parseInt(String(x).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function worse(a: DviSeverity, b: DviSeverity): DviSeverity {
  const order: DviSeverity[] = ["na", "green", "unknown", "yellow", "red"];
  return order.indexOf(b) > order.indexOf(a) ? b : a;
}

// --- DVI fetch (remote or mock) ---
async function fetchRemoteDvi(vin?: string, roId?: string, ticketId?: string): Promise<DviReport | null> {
  if (!AUTOFLOW_BASE || !AUTOFLOW_API_KEY) return null;

  // Example endpoint; adjust to your Autoflow path:
  const url = new URL(`${AUTOFLOW_BASE.replace(/\/+$/, "")}/dvi`);
  if (vin) url.searchParams.set("vin", vin);
  if (roId) url.searchParams.set("roId", roId);
  if (ticketId) url.searchParams.set("ticketId", ticketId);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${AUTOFLOW_API_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    console.warn("Autoflow DVI fetch failed:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = await res.json();
  if (!json || !Array.isArray(json.items)) return null;

  return {
    vin: json.vin ?? vin,
    roId: json.roId ?? roId,
    ticketId: json.ticketId ?? ticketId,
    items: json.items,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchMockDvi(vin?: string): Promise<DviReport | null> {
  // Try dev fixture first: /public/dev-fixtures/dvi/<VIN>.json
  try {
    if (vin) {
      const base = process.env.NEXT_PUBLIC_BASE_URL || "";
      const resp = await fetch(`${base}/dev-fixtures/dvi/${vin}.json`, { cache: "no-store" });
      if (resp.ok) {
        const json = await resp.json();
        if (json && Array.isArray(json.items)) return json as DviReport;
      }
    }
  } catch {}
  // Fallback mock
  return {
    vin,
    items: [
      { name: "Oil & Filter", severity: "red" },
      { name: "Air filter", severity: "yellow" },
      { name: "Brakes (pads/rotors)", severity: "red" },
      { name: "Coolant", severity: "green" },
    ],
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchAutoflowDvi(opts: { vin?: string; roId?: string; ticketId?: string }): Promise<DviReport | null> {
  const key = `dvi:${opts.vin || ""}:${opts.roId || ""}:${opts.ticketId || ""}`;
  const cached = cacheGet(DVI_CACHE, key);
  if (cached) return cached;

  const data = AUTOFLOW_MOCK
    ? await fetchMockDvi(opts.vin)
    : await fetchRemoteDvi(opts.vin, opts.roId, opts.ticketId);

  if (data) cacheSet(DVI_CACHE, key, data);
  return data;
}

// --- Normalize DVI to { canon -> severity } ---
export function normalizeDvi(dvi: DviReport | null): Record<string, DviSeverity> {
  const out: Record<string, DviSeverity> = {};
  if (!dvi) return out;
  for (const it of dvi.items || []) {
    const canon = toCanonKey(it.name || "");
    if (!canon) continue;
    const sev: DviSeverity = (it.severity || "unknown") as DviSeverity;
    const prev = out[canon] || "na";
    out[canon] = worse(prev, sev);
  }
  return out;
}

// --- Overlay helper: push DVI severities onto analysis statuses ---
export function overlayAnalysisWithDvi(analysis: any, dviMap: Record<string, DviSeverity>) {
  if (!analysis?.maintenance_comparison?.items) return analysis;
  for (const item of analysis.maintenance_comparison.items) {
    const canon = toCanonKey(item.service || "");
    if (!canon) continue;
    const sev = dviMap[canon];
    if (!sev) continue;

    // Upgrade rules (never downgrade):
    if (sev === "red" && item.status !== "overdue") item.status = "overdue";
    else if (sev === "yellow" && (item.status === "not_yet" || item.status === "coming_soon")) item.status = "due";
  }
  return analysis;
}

// ================== RO METADATA (VIN / mileage / RO#) ==================

function extractRoMeta(json: any, roId?: string): RoMeta {
  // possible VIN fields
  const vin =
    json?.vin ||
    json?.vehicle?.vin ||
    json?.VehicleVIN ||
    json?.ticket?.vin ||
    json?.Vehicle?.VIN ||
    undefined;

  // possible mileage fields
  const mileage =
    stripNum(json?.odometer) ??
    stripNum(json?.vehicle?.mileage) ??
    stripNum(json?.mileageIn) ??
    stripNum(json?.VehicleMileage) ??
    stripNum(json?.serviceVehicle?.mileage) ??
    null;

  // possible RO number fields
  const roNumber =
    json?.roNumber ||
    json?.number ||
    json?.ro ||
    json?.roId ||
    json?.ticketId ||
    json?.ticket?.number ||
    roId ||
    undefined;

  return { vin, mileage, roNumber, roId, raw: json, fetchedAt: new Date().toISOString() };
}

async function fetchRemoteRoMeta(roId: string): Promise<RoMeta | null> {
  if (!AUTOFLOW_BASE || !AUTOFLOW_API_KEY) return null;

  // Example endpoint; adjust to your Autoflow path:
  const url = `${AUTOFLOW_BASE.replace(/\/+$/, "")}/repair-orders/${encodeURIComponent(roId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AUTOFLOW_API_KEY}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn("Autoflow RO fetch failed:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = await res.json();
  return extractRoMeta(json, roId);
}

async function fetchMockRoMeta(roId: string): Promise<RoMeta | null> {
  // Try dev fixture: /public/dev-fixtures/autoflow/ro-<id>.json
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || "";
    const resp = await fetch(`${base}/dev-fixtures/autoflow/ro-${encodeURIComponent(roId)}.json`, { cache: "no-store" });
    if (resp.ok) {
      const json = await resp.json();
      return extractRoMeta(json, roId);
    }
  } catch {}
  // Default mock
  return {
    roId,
    roNumber: roId,
    vin: "1FTFW1E64CFB09199",
    mileage: 200005,
    fetchedAt: new Date().toISOString(),
    raw: { mock: true },
  };
}

export async function fetchAutoflowRoMeta(roId: string): Promise<RoMeta | null> {
  const key = `ro:${roId}`;
  const cached = cacheGet(RO_CACHE, key);
  if (cached) return cached;

  const data = AUTOFLOW_MOCK ? await fetchMockRoMeta(roId) : await fetchRemoteRoMeta(roId);
  if (data) cacheSet(RO_CACHE, key, data);
  return data;
}
