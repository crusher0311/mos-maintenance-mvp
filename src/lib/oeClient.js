/**
 * OE schedule client (stubbed so builds work without real credentials).
 */

export async function getOeSchedule(vin, _opts = {}) {
  // When you add a real provider, flip this check and return the live JSON.
  const hasRealProvider = !!(process.env.OE_API_BASE && process.env.OE_API_KEY);
  if (hasRealProvider) {
    // Example placeholder (keep for later wiring):
    // const res = await fetch(`${process.env.OE_API_BASE}/schedule/${encodeURIComponent(vin)}`, {
    //   headers: { Authorization: `Bearer ${process.env.OE_API_KEY}` }
    // });
    // return await res.json();
  }
  return stubOe(vin);
}

/** Back-compat alias some code may still import */
export async function fetchOeSchedule(vin, opts) {
  return getOeSchedule(vin, opts);
}

/** Minimal deterministic stub */
export function stubOe(vin) {
  return {
    stub: true,
    vin,
    maintenance: [
      { code: "OIL_CHANGE",       name: "Oil & Filter Change", status: "overdue" },
      { code: "TIRE_ROTATION",    name: "Tire Rotation",       status: "soon" },
      { code: "CABIN_AIR_FILTER", name: "Cabin Air Filter",    status: "not_yet" }
    ]
  };
}

const oeClient = { getOeSchedule, fetchOeSchedule, stubOe };
export default oeClient;
