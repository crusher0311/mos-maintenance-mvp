// src/lib/carfaxClient.js

/**
 * Carfax Service History Check™ client
 *
 * Expected env (.env.local):
 *   CARFAX_POST_URL=https://servicesocket.carfax.com/data/1
 *   CARFAX_PRODUCT_DATA_ID=207625C61DD1C38E  // your PDI
 *   CARFAX_LOCATION_ID=HXNUGTUXKE            // your Comp/Location code
 *
 * If any are missing, we return a safe stub so the pipeline can keep moving.
 */

/** ---- env + helpers ---- */
function readEnv() {
  return {
    postUrl: process.env.CARFAX_POST_URL || "",
    pdi: process.env.CARFAX_PRODUCT_DATA_ID || "",
    locationId: process.env.CARFAX_LOCATION_ID || "",
  };
}

/**
 * Extremely defensive normalizer: tries to find odometer/service fields
 * regardless of payload shape. Also includes a path for SHC's
 * `serviceHistory.displayRecords[]`.
 */
function normalizeCarfaxPayload(vin, raw) {
  const odometerPoints = [];
  const serviceEvents = [];

  const pushOdo = (date, mileage) => {
    if (mileage == null) return;
    const num = Number(String(mileage).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(num)) return;
    odometerPoints.push({
      vin,
      date: date ? new Date(date).toISOString() : null,
      mileage: Math.round(num),
      source: "carfax",
    });
  };

  const pushSvc = (date, mileage, description, vendorName) => {
    const num = mileage != null ? Number(String(mileage).replace(/[^\d.-]/g, "")) : null;
    serviceEvents.push({
      vin,
      date: date ? new Date(date).toISOString() : null,
      mileage: Number.isFinite(num) ? Math.round(num) : null,
      description: description || "Service Event",
      vendorName: vendorName || null,
      source: "carfax",
    });
  };

  try {
    // ---- Generic shapes (fallbacks) ----
    const events = raw?.events || raw?.history || raw?.serviceHistory || [];
    if (Array.isArray(events)) {
      for (const e of events) {
        const date =
          e?.date || e?.serviceDate || e?.transactionDate || e?.eventDate || null;
        const mileage =
          e?.odometer || e?.odometerReading || e?.mileage || e?.miles || null;
        const descr =
          e?.description || e?.service || e?.details || e?.type || "Service Event";
        const vendor =
          e?.dealerName || e?.dealer || e?.shop || e?.location || null;

        if (mileage != null) pushOdo(date, mileage);
        pushSvc(date, mileage, descr, vendor);
      }
    }

    const odoList =
      raw?.odometerReadings || raw?.odometers || raw?.odometer || [];
    if (Array.isArray(odoList)) {
      for (const o of odoList) {
        pushOdo(o?.date || o?.recordedAt || null, o?.mileage ?? o?.value);
      }
    }

    if (raw?.lastOdometer || raw?.lastMileage) {
      pushOdo(
        raw?.lastOdometerDate || raw?.date || null,
        raw.lastOdometer ?? raw.lastMileage
      );
    }

    // ---- Carfax SHC-specific shape ----
    const displayRecords = raw?.serviceHistory?.displayRecords;
    if (Array.isArray(displayRecords)) {
      for (const r of displayRecords) {
        const date = r?.displayDate || r?.date || null;
        const mileage = r?.odometer ?? r?.mileage ?? null;
        const type = r?.type || "service";
        const text =
          Array.isArray(r?.text) ? r.text.filter(Boolean).join("; ") : (r?.text || "").toString().trim();
        const description = text || r?.description || "Service Event";
        const vendorName = r?.dealerName || r?.location || null;

        if (mileage != null) pushOdo(date, mileage);
        if (type?.toLowerCase() !== "recall") {
          pushSvc(date, mileage, description, vendorName);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Carfax normalization warning:", err);
  }

  return { odometerPoints, serviceEvents };
}

/** If env is missing, return a stub so you can continue building */
function stubCarfax(vin) {
  const now = new Date();
  const past = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 90);
  const raw = {
    stub: true,
    serviceHistory: {
      displayRecords: [
        {
          displayDate: past.toISOString(),
          odometer: 100000,
          text: ["Oil & Filter Change"],
          type: "service",
        },
        {
          displayDate: now.toISOString(),
          odometer: 103250,
          text: ["Tire Rotation"],
          type: "service",
        },
      ],
    },
  };
  const normalized = normalizeCarfaxPayload(vin, raw);
  return { ok: true, raw, normalized, source: "stub" };
}

/** Main entry: call Carfax SHC (POST) or fall back to stub */
export async function fetchCarfaxByVin(vin) {
  const { postUrl, pdi, locationId } = readEnv();

  if (!postUrl || !pdi || !locationId) {
    return stubCarfax(vin);
  }

  try {
    const res = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        vin,
        productDataId: pdi,
        locationId,
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `Carfax HTTP ${res.status}` };
    }

    const raw = await res.json().catch(() => ({}));
    const normalized = normalizeCarfaxPayload(vin, raw);
    return { ok: true, raw, normalized, source: postUrl };
  } catch (err) {
    return { ok: false, error: `Carfax fetch failed: ${err.message}` };
  }
}

export default fetchCarfaxByVin;
