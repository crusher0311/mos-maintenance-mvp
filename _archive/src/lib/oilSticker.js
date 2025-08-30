/**
 * oilSticker.js
 * Helper to pick the Engine Oil service from /api/vin-next-due JSON
 * and format a simple “sticker” payload (next miles/months, overdue, etc.).
 *
 * Expected input shape (trimmed):
 * {
 *   vin, decoded:{year,make,model},
 *   inputs:{ schedule, ... },
 *   dueNow:[{ name, category, schedule, triggers:{ miles:{next,overdueBy,due}, months:{...} } }],
 *   upcoming:[{ ...same shape... }]
 * }
 */

/** Match names that are clearly about oil service */
function isOilServiceName(name = "") {
  return /engine\s*oil|oil\s*change|oil\s*filter/i.test(name);
}

/** Safely read nested trigger info */
function readTriggers(svc) {
  const miles = svc?.triggers?.miles || {};
  const months = svc?.triggers?.months || {};
  return {
    dueNow: !!svc?.due,
    nextMiles: miles.next ?? null,
    overdueMilesBy: miles.overdueBy ?? null,
    nextMonths: months.next ?? null,
    overdueMonthsBy: months.overdueBy ?? null
  };
}

/**
 * Pick the best single oil-related service from API response:
 * 1) Prefer an oil item that is due now
 * 2) Else pick first upcoming oil item
 * Returns null if none found.
 */
export function pickOilService(apiData) {
  if (!apiData) return null;

  const dueNow = Array.isArray(apiData.dueNow) ? apiData.dueNow : [];
  const upcoming = Array.isArray(apiData.upcoming) ? apiData.upcoming : [];

  const dueOil = dueNow.find(s => isOilServiceName(s?.name));
  const upcOil = upcoming.find(s => isOilServiceName(s?.name));
  const svc = dueOil || upcOil;
  if (!svc) return null;

  const { dueNow: isDue, nextMiles, overdueMilesBy, nextMonths, overdueMonthsBy } = readTriggers(svc);

  return {
    title: "Engine Oil",
    vin: apiData.vin || null,
    vehicle: apiData.decoded
      ? `${apiData.decoded.year ?? ""} ${apiData.decoded.make ?? ""} ${apiData.decoded.model ?? ""}`.trim()
      : null,
    schedule: svc.schedule || apiData.inputs?.schedule || "normal",
    dueNow: isDue,
    next: {
      miles: nextMiles,
      months: nextMonths
    },
    overdueBy: {
      miles: overdueMilesBy,
      months: overdueMonthsBy
    },
    // Keep a small reference to the original service row (handy for UI/details)
    source: {
      category: svc.category ?? null,
      name: svc.name ?? null,
      trans_notes: svc.trans_notes ?? null
    }
  };
}

/**
 * Optional: pretty string helpers if you want to render text quickly.
 */
export function formatNextMiles(sticker) {
  if (!sticker) return "";
  const { dueNow, next, overdueBy } = sticker;
  if (dueNow && typeof overdueBy.miles === "number") {
    return `OVERDUE by ${overdueBy.miles.toLocaleString()} mi`;
  }
  if (typeof next.miles === "number") {
    return `Next at ${next.miles.toLocaleString()} mi`;
  }
  return "Miles: n/a";
}

export function formatNextMonths(sticker) {
  if (!sticker) return "";
  const { dueNow, next, overdueBy } = sticker;
  if (dueNow && typeof overdueBy.months === "number") {
    return `OVERDUE by ${overdueBy.months} mo`;
  }
  if (typeof next.months === "number") {
    return `Next at ${next.months} mo`;
  }
  return "Months: n/a";
}

// Default export for convenience
export default pickOilService;
