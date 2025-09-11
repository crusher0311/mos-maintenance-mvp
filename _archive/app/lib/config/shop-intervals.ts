// app/lib/config/shop-intervals.ts

/**
 * Shop interval overrides:
 * - Absolute miles per service name (applies AFTER the OEM cap when we extend).
 * - Precedence: overrideMiles > policy factor rule > inferred/original.
 *
 * You can provide overrides via:
 *   1) process.env.SHOP_INTERVAL_OVERRIDES_JSON  (stringified JSON)
 *   2) a local JSON file: ./data/shop-interval-overrides.json  { "Replace Spark Plugs": 45000, ... }
 */

import fs from "node:fs";
import path from "node:path";

export type IntervalOverrides = Record<string, number>; // serviceName -> miles

export function loadIntervalOverrides(): IntervalOverrides {
  // 1) ENV
  const envJson = process.env.SHOP_INTERVAL_OVERRIDES_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson);
      if (parsed && typeof parsed === "object") return parsed as IntervalOverrides;
    } catch {}
  }

  // 2) Local file
  try {
    const p = path.join(process.cwd(), "data", "shop-interval-overrides.json");
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(txt);
      if (parsed && typeof parsed === "object") return parsed as IntervalOverrides;
    }
  } catch {}

  return {};
}

