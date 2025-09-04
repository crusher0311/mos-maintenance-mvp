// app/lib/logic/extend-oe.ts
import type { VdbResponse } from "../../types/maintenance";
import { loadIntervalOverrides, type IntervalOverrides } from "../config/shop-intervals";

export type ExtendPolicy = {
  multiplier?: number;      // how far past OEM ceiling to extend (default 3x)
  factor?: number;          // fraction of original interval AFTER cap (default 0.5)
  exemptions?: string[];    // services that KEEP original interval (no factor), e.g. oil & rotation
  overrides?: IntervalOverrides; // absolute miles per service (takes precedence)
};

/**
 * Finds the OEM maximum mileage and builds a per-service map of mileages.
 */
function analyzeMaintenance(vdb: VdbResponse) {
  const maxOemMileage = Math.max(...vdb.maintenance.map(m => m.mileage || 0), 0);

  // Map service -> sorted set of OEM mileages where it appears
  const serviceMiles = new Map<string, number[]>();
  for (const entry of vdb.maintenance) {
    const at = entry.mileage || 0;
    for (const s of entry.service_items || []) {
      const arr = serviceMiles.get(s) ?? [];
      arr.push(at);
      serviceMiles.set(s, arr);
    }
  }
  for (const [k, arr] of serviceMiles) {
    arr.sort((a,b) => a - b);
    serviceMiles.set(k, arr);
  }

  return { maxOemMileage, serviceMiles };
}

/**
 * Derive an "original interval" from OEM appearances:
 *  - if service appears >= 2 times, interval = smallest positive delta
 *  - else unknown -> return null
 */
function inferOriginalInterval(miles: number[]): number | null {
  if (miles.length < 2) return null;
  let best: number | null = null;
  for (let i=1; i<miles.length; i++) {
    const delta = miles[i] - miles[i-1];
    if (delta > 0) {
      best = best === null ? delta : Math.min(best, delta);
    }
  }
  return best;
}

/**
 * Extends a VdbResponse's maintenance list up to "multiplier Ã— OEM max mileage".
 * For each service, after the OEM max:
 *   - If override exists -> use that miles interval.
 *   - Else if NOT exempt -> use floor(originalInterval * factor) (>= 1k safety).
 *   - Else (exempt) -> keep original interval.
 * Skips duplicates of existing OEM mileages.
 */
export function extendVdbMaintenance(
  vdb: VdbResponse,
  policy?: ExtendPolicy
): VdbResponse {
  const { maxOemMileage, serviceMiles } = analyzeMaintenance(vdb);

  const multiplier = policy?.multiplier ?? 3;
  const factor = policy?.factor ?? 0.5;
  const exemptions = new Set((policy?.exemptions ?? []).map(s => s.toLowerCase()));
  const overrides = policy?.overrides ?? loadIntervalOverrides();

  const targetMax = Math.max(maxOemMileage, 0) * Math.max(multiplier, 1);

  // Build a quick lookup to avoid duplicates: mileage -> Set(service)
  const existing = new Map<number, Set<string>>();
  for (const e of vdb.maintenance) {
    if (!existing.has(e.mileage)) existing.set(e.mileage, new Set<string>());
    for (const s of e.service_items) existing.get(e.mileage)!.add(s);
  }

  // Plan new entries to append
  type OutEntry = { mileage: number; services: string[] };
  const toAppend = new Map<number, Set<string>>();

  for (const [service, milesArr] of serviceMiles.entries()) {
    const serviceLower = service.toLowerCase();

    // compute "original interval" if any
    const original = inferOriginalInterval(milesArr);

    // choose interval to use AFTER the OEM cap
    let intervalAfterCap: number | null = null;

    // 1) explicit override wins
    if (overrides[service] && overrides[service] > 0) {
      intervalAfterCap = Math.floor(overrides[service]);
    } else if (original && original > 0) {
      // 2) policy rule
      if (exemptions.has(serviceLower)) {
        intervalAfterCap = original; // keep OEM
      } else {
        intervalAfterCap = Math.max(1000, Math.floor(original * factor)); // safety min 1k
      }
    } else {
      // we cannot infer an interval (appeared only once and no override). Skip.
      continue;
    }

    // last OEM occurrence for this service (or OEM max if it never appears exactly at max)
    const lastOemPoint = milesArr[milesArr.length - 1] ?? maxOemMileage;

    // generate occurrences strictly beyond OEM max
    let next = Math.max(lastOemPoint, maxOemMileage) + intervalAfterCap;
    while (next <= targetMax) {
      // avoid duplicates at same mileage
      const alreadyAtM = existing.get(next);
      if (!alreadyAtM || !alreadyAtM.has(service)) {
        const set = toAppend.get(next) ?? new Set<string>();
        set.add(service);
        toAppend.set(next, set);
      }
      next += intervalAfterCap;
    }
  }

  // Append new entries merged per mileage
  const newEntries: OutEntry[] = [];
  for (const [m, set] of toAppend.entries()) {
    newEntries.push({ mileage: m, services: Array.from(set).sort() });
  }
  newEntries.sort((a,b) => a.mileage - b.mileage);

  const extended: VdbResponse = {
    ...vdb,
    maintenance: [
      ...vdb.maintenance,
      ...newEntries.map(e => ({ mileage: e.mileage, service_items: e.services }))
    ],
  };

  return extended;
}

