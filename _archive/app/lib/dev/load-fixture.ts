// app/lib/dev/load-fixture.ts
import fs from "node:fs";
import path from "node:path";

export function loadVinFixture(vin: string): any | null {
  try {
    const fn = path.join(process.cwd(), "app", "dev-fixtures", "oe", `${vin}.json`);
    if (!fs.existsSync(fn)) return null;
    const raw = fs.readFileSync(fn, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

