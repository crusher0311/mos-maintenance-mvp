// src/lib/oeClient.js

/**
 * Fetch OEM maintenance schedule for a VIN and return:
 *   - raw payload
 *   - normalized `oeSchedule` array for DB storage later
 *
 * ENV expected:
 *   OE_BASE_URL=https://<oe-api-base>
 *   OE_API_KEY=xxxx
 * Optional:
 *   OE_AUTH_HEADER=Authorization        (default "Authorization")
 *   OE_EXTRA_HEADERS={"Accept":"application/json"}   (JSON string)
 */

function readEnv() {
  const baseUrl = process.env.OE_BASE_URL || "";
  const apiKey = process.env.OE_API_KEY || "";
  const authHeader = process.env.OE_AUTH_HEADER || "Authorization";
  let extra = {};
  try {
    extra = process.env.OE_EXTRA_HEADERS ? JSON.parse(process.env.OE_EXTRA_HEADERS) : {};
  } catch {
    extra = {};
  }
  return { baseUrl, apiKey, authHeader, extra };
}

function headersWithAuth() {
  const { apiKey, authHeader, extra } = readEnv();
  const h = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (apiKey) {
    if (authHeader.toLowerCase() === "authorization") {
      h["Authorization"] = `Bearer ${apiKey}`;
    } else {
      h[authHeader] = apiKey;
    }
  }
  return h;
}

/**
 * Normalize various OEM schedule shapes into a common structure.
 * We try common field names and fall back carefully.
 */
function normalizeOePayload(vin, raw) {
  const oeSchedule = [];

  const pushItem = (code, title, miles, months, notes) => {
    const mi = Number(miles);
    const mo = Number(months);
    oeSchedule.push({
      vin,
      serviceCode: (code || title || "SERVICE").toString(),
      title: title || "Service",
      intervalMiles: Number.isFinite(mi) && mi > 0 ? mi : null,
      intervalMonths: Number.isFinite(mo) && mo > 0 ? mo : null,
      notes: notes || null,
      source: "oe",
    });
  };

  try {
    // Many APIs: { maintenance: [ { code, name/title, interval: { miles, months }, notes } ] }
    const list =
      raw?.maintenance ||
      raw?.schedule ||
      raw?.items ||
      raw?.services ||
      [];

    if (Array.isArray(list)) {
      for (const it of list) {
        const code =
          it?.code || it?.id || it?.serviceCode || null;
        const title =
          it?.title || it?.name || it?.service || "Service";
        const miles =
          it?.interval?.miles ?? it?.miles ?? it?.intervalMiles ?? null;
        const months =
          it?.interval?.months ?? it?.months ?? it?.intervalMonths ?? null;
        const notes =
          it?.notes || it?.description || null;

        pushItem(code, title, miles, months, notes);
      }
    }

    // Some APIs nest by mileage buckets, e.g. { schedulesByMileage: { "7500": [ ... ] } }
    const byMileage = raw?.schedulesByMileage || raw?.intervalsByMiles || null;
    if (byMileage && typeof byMileage === "object") {
      for (const [miles, arr] of Object.entries(byMileage)) {
        if (!Array.isArray(arr)) continue;
        for (const it of arr) {
          const title = it?.title || it?.name || "Service";
          const months = it?.months ?? it?.intervalMonths ?? null;
          const notes = it?.notes || it?.description || null;
          pushItem(it?.code || null, title, miles, months, notes);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("OE normalization warning:", err);
  }

  return { oeSchedule };
}

/** Stub so you can keep building without keys */
function stubOe(vin) {
  const raw = {
    stub: true,
    maintenance: [
      { code
