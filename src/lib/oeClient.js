// src/lib/oeClient.js

/**
 * Fetch OE maintenance schedule for a VIN.
 * If real credentials aren't configured yet, we fall back to a stub so builds succeed.
 */
export async function getOeSchedule(vin, _opts = {}) {
  // TODO: wire up your real provider here when keys are available.
  // Keep this branch so the API surface stays consistent.
  const hasRealProvider = !!(process.env.OE_API_BASE && process.env.OE_API_KEY);
  if (hasRealProvider) {
    // Example shape for later:
    // const res = await fetch(`${process.env.OE_API_BASE}/...`, { headers: { Authorization: `Bearer ${process.env.OE_API_KEY}` }});
    // return await res.json();
  }
  return stubOe(vin);
}

/** Alias kept for compatibility with older imports */
export async function fetchOeSchedule(vin, opts) {
  return getOeSchedule(vin, opts);
}

/** Stub so you can keep building without keys */
export function stubOe(vin) {
  return {
    stub: true,
    vin,
    maintenance: [
      { code: "OIL_CHANGE",      name: "Oil & Filter Change", status: "overdue" },
      { code: "TIRE_ROTATION",   name: "Tire Rotation",       status: "soon" },
      { code: "CABIN_AIR_FILTER",name: "Cabin Air Filter",    status: "not_yet" }
    ]
  };
}

const oeClient = { getOeSchedule, fetchOeSchedule, stubOe };
export default oeClient;
