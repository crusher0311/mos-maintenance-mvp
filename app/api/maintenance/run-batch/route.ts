// /app/api/maintenance/run-batch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../lib/mongo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Batch runner:
 * - Reads VINs from `vehicles`
 * - Skips "recent" results in `vehicleschedules` unless refresh:true
 * - Calls analyzer API for each VIN
 * - Upserts results into `vehicleschedules`
 *
 * ENV:
 *   BATCH_RECENT_HOURS  (default 24)
 *   BATCH_CONCURRENCY   (default 2)
 */

const ANALYZE_BASE = process.env.ANALYZE_BASE || "http://localhost:3000";
const BATCH_RECENT_HOURS = Number(process.env.BATCH_RECENT_HOURS ?? 24);
const CONCURRENCY = Number(process.env.BATCH_CONCURRENCY ?? 2);

function isValidVin(v: string) {
  return typeof v === "string" && v.length === 17;
}

function msAgo(hours: number) {
  return Date.now() - hours * 3600 * 1000;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (t: T, idx: number) => Promise<any>
) {
  const out: any[] = [];
  let i = 0;

  async function loop() {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await worker(items[idx], idx);
      } catch (e: any) {
        out[idx] = { error: e?.message || String(e) };
      }
    }
  }

  const runners = Array.from({ length: Math.max(1, limit) }, loop);
  await Promise.all(runners);
  return out;
}

export async function GET() {
  // Small status view: latest saved analyses
  const db = await getDb();
  const docs = await db
    .collection("vehicleschedules")
    .find({}, { projection: { _id: 0, vin: 1, updatedAt: 1, counters: 1 } })
    .sort({ updatedAt: -1 })
    .limit(10)
    .toArray();

  return NextResponse.json({ latest: docs });
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json().catch(() => ({}));

    const limit = Number(body?.limit ?? 10);
    const shopId = body?.shopId || undefined;
    const locationId = body?.locationId || undefined;
    const refresh = Boolean(body?.refresh); // <— honor this

    // pull VINs from `vehicles`
    const q: any = {};
    if (shopId) q.shopId = shopId;

    const vehicles = await db
      .collection("vehicles")
      .find(q, { projection: { _id: 0, vin: 1, shopId: 1 } })
      .limit(limit)
      .toArray();

    const taken = vehicles.length;

    const recentCutoff = msAgo(BATCH_RECENT_HOURS);
    const results: any[] = [];
    let ok = 0,
      skipped_recent = 0,
      skipped_invalid = 0,
      errored = 0;

    const tasks = vehicles.map((v) => async () => {
      const vin = (v?.vin || "").toUpperCase();

      if (!isValidVin(vin)) {
        skipped_invalid++;
        const r = { vin, skipped: true, reason: "invalid_vin" as const };
        results.push(r);
        return r;
      }

      // check vehicleschedules for recency
      const existing = await db
        .collection("vehicleschedules")
        .findOne({ vin }, { projection: { updatedAt: 1 } });

      const isRecent =
        existing && typeof existing.updatedAt === "number"
          ? existing.updatedAt > recentCutoff
          : false;

      if (isRecent && !refresh) {
        skipped_recent++;
        const r = { vin, skipped: true, reason: "recent_cache" as const };
        results.push(r);
        return r;
      }

      // call analyzer API
      const params = new URLSearchParams();
      if (locationId) params.set("locationId", locationId);
      // cache-buster so server-side caches won't short-circuit
      params.set("r", Math.random().toString(36).slice(2));

      const url = `${ANALYZE_BASE}/api/maintenance/analyze/${encodeURIComponent(
        vin
      )}?${params.toString()}`;

      let res: Response | null = null;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } catch (err: any) {
        errored++;
        const r = {
          vin,
          ok: false,
          status: 0,
          error: `fetch_failed: ${err?.message || String(err)}`,
        };
        results.push(r);
        return r;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        errored++;
        const r = { vin, ok: false, status: res.status, error: txt };
        results.push(r);
        return r;
      }

      const data = await res.json().catch(() => ({}));
      const items =
        data?.analysis?.maintenance_comparison?.items || ([] as any[]);
      const counters = items.reduce(
        (acc: any, it: any) => {
          const s = it?.status || "unknown";
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      // upsert into vehicleschedules
      await db.collection("vehicleschedules").updateOne(
        { vin },
        {
          $set: {
            vin,
            shopId: v.shopId ?? null,
            result: {
              vin: data?.vin,
              make: data?.make,
              model: data?.model,
              year: data?.year,
            },
            analysis: data?.analysis || null,
            counters,
            updatedAt: Date.now(),
          },
        },
        { upsert: true }
      );

      ok++;
      const r = { vin, ok: true, status: res.status, counters };
      results.push(r);
      return r;
    });

    // run with limited concurrency
    await runWithConcurrency(tasks, CONCURRENCY, (t) => t());

    return NextResponse.json({
      summary: {
        took: taken,
        ok,
        skipped_recent,
        skipped_invalid,
        errored,
      },
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
