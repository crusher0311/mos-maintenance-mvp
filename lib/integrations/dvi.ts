// lib/integrations/dvi.ts
import { getDb } from "@/lib/mongo";

/** Heuristic base64 decoder: if it looks like base64, decode; else return as-is */
function maybeDecodeBase64(s?: string | null): string {
  if (!s) return "";
  const looksB64 = /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0;
  if (!looksB64) return s;
  try {
    const buf = Buffer.from(s, "base64");
    const txt = buf.toString("utf8");
    // If re-encoding yields original, assume success
    if (Buffer.from(txt, "utf8").toString("base64") === s) return txt;
    return s;
  } catch {
    return s;
  }
}

async function getShopAutoflowCreds(shopId: number): Promise<{
  apiBase: string;
  apiKeyRaw: string;
  apiPasswordRaw: string;
}> {
  const db = await getDb();
  const shop = await db.collection("shops").findOne(
    { shopId },
    { projection: { "credentials.autoflow": 1 } }
  );

  const af = (shop as any)?.credentials?.autoflow || {};
  const apiKeyRaw = maybeDecodeBase64(af.apiKey);
  const apiPasswordRaw = maybeDecodeBase64(af.apiPassword);
  const apiBaseDecoded = maybeDecodeBase64(af.apiBase);
  const apiBase = (apiBaseDecoded || "").replace(/\/+$/, "");

  if (!apiKeyRaw || !apiPasswordRaw || !apiBase) {
    throw new Error("Missing AutoFlow credentials for this shop.");
  }
  return { apiBase, apiKeyRaw, apiPasswordRaw };
}

/**
 * Calls AutoFlow DVI API: GET /dvi/{RoNumber}
 * Uses shop's saved credentials (key/password/base) from Mongo.
 */
export async function importDVI(args: { shopId: number; roNumber: string | number }) {
  const { shopId } = args;
  const ro = String(args.roNumber);

  const { apiBase, apiKeyRaw, apiPasswordRaw } = await getShopAutoflowCreds(shopId);
  const basic = Buffer.from(`${apiKeyRaw}:${apiPasswordRaw}`, "utf8").toString("base64");
  const url = `${apiBase}/dvi/${encodeURIComponent(ro)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Basic ${basic}`,
    },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as any;

  const db = await getDb();
  const now = new Date();

  if (!res.ok) {
    const message = json?.message || json?.error || `AutoFlow DVI HTTP ${res.status}`;
    await db.collection("dvi").insertOne({
      shopId,
      roNumber: ro,
      ok: false,
      error: message,
      status: res.status,
      raw: json ?? null,
      fetchedAt: now,
    });
    throw new Error(message);
  }

  const content = Array.isArray(json?.content) ? json.content : [];
  if (!content.length) {
    await db.collection("dvi").insertOne({
      shopId,
      roNumber: ro,
      ok: true,
      empty: true,
      raw: json ?? null,
      fetchedAt: now,
    });
    return { insertedCount: 0, rows: [] };
  }

  const rows = content.map((c: any) => {
    const vin = c?.vin ? String(c.vin).toUpperCase() : null;
    const milesNum =
      c?.mileage != null ? Number(String(c.mileage).replace(/[^\d.-]/g, "")) : null;

    return {
      shopId,
      roNumber: ro,
      vin,
      mileage: Number.isFinite(milesNum) ? milesNum : null,
      customer: {
        id: c?.customer_id ?? c?.customer_remote_id ?? null,
        first: c?.customer_firstname ?? null,
        last: c?.customer_lastname ?? null,
      },
      vehicle: {
        year: c?.year ?? null,
        make: c?.make ?? null,
        model: c?.model ?? null,
        license: c?.license ?? null,
        vin,
      },
      sheetId: c?.sheet_id ?? null,
      notes: c?.additional_notes ?? null,
      raw: c,
      fetchedAt: now,
      ok: true,
      source: "autoflow",
    };
  });

  const result = await db.collection("dvi").insertMany(rows);

  // Best-effort enrichment from the first row
  const first = rows[0];
  if (first) {
    if (first.vin) {
      await db.collection("vehicles").updateOne(
        { shopId, vin: first.vin },
        {
          $set: {
            year: first.vehicle.year ?? null,
            make: first.vehicle.make ?? null,
            model: first.vehicle.model ?? null,
            license: first.vehicle.license ?? null,
            updatedAt: now,
          },
          $setOnInsert: { shopId, vin: first.vin, createdAt: now },
        },
        { upsert: true }
      );
      await db.collection("tickets").updateOne(
        { shopId, roNumber: ro },
        {
          $set: {
            vin: first.vin,
            mileage: first.mileage ?? null,
            updatedAt: now,
            source: "autoflow-dvi",
          },
          $setOnInsert: { shopId, roNumber: ro, createdAt: now },
        },
        { upsert: true }
      );
      await db.collection("customers").updateMany(
        { shopId, lastRo: ro },
        {
          $set: {
            lastVin: first.vin,
            lastMileage: Number.isFinite(first.mileage) ? first.mileage : undefined,
            updatedAt: now,
          },
        }
      );
    }
  }

  return { insertedCount: result.insertedCount, rows };
}
