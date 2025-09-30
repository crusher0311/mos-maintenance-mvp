// app/lib/providers/vdb.ts
import { OeScheduleItem, VdbResponse, NormalizedTask } from "@/app/types/maintenance";

export function normalizeVdb(vdb: VdbResponse): NormalizedTask[] {
  // VDB gives an array of { mileage, service_items[] }
  // We flatten into a list of (task, intervalMiles)
  const out: NormalizedTask[] = [];
  for (const block of vdb.maintenance ?? []) {
    const interval = Number(block.mileage) || 0;
    for (const raw of block.service_items ?? []) {
      const task = cleanupTask(raw);
      if (!task) continue;
      out.push({ task, intervalMiles: interval });
    }
  }
  // Deduplicate identical (task, interval) combos
  const seen = new Set<string>();
  return out.filter(t => {
    const key = `${t.task}|${t.intervalMiles}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// simple normalizer to reduce wording variance
function cleanupTask(s: string): string {
  if (!s) return "";
  let t = s.trim();
  t = t.replace(/\s+/g, " ");
  // unify common variants
  t = t.replace(/engine oil & filter/i, "Engine Oil & Filter");
  t = t.replace(/replace spark plugs?/i, "Replace Spark Plugs");
  t = t.replace(/rotate tires?/i, "Rotate Tires");
  t = t.replace(/inspect brake system/i, "Inspect Brake System");
  return t;
}

