// src/lib/parsers/autoflow.js
import { OdometerPoint, InspectionFinding, ServiceEvent, Vehicle } from "@/lib/models";

/** Utilities */
function toNumber(x) {
  const n = Number(String(x ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function dateOnly(d) {
  const t = new Date(d || Date.now());
  t.setUTCHours(0, 0, 0, 0);
  return t;
}
function normStr(s) {
  return String(s || "").trim();
}
function take(obj, keys = []) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

// Autoflow item_status: "0"=red, "1"=yellow, "2"=green
function normalizeFinding(item) {
  const raw = String(item?.item_status ?? "").trim();
  let status = "";
  if (raw === "0") status = "red";
  else if (raw === "1") status = "yellow";
  else if (raw === "2") status = "green";
  else return null;

  const label = item?.item_name || "Item";
  const notes = item?.item_notes || "";
  const code =
    (item?.item_id ? String(item.item_id) : label)
      .toLowerCase()
      .replace(/\s+/g, "_");

  return { code, label, status, notes };
}

function extractFindingsFromDviCategories(dviCategories = []) {
  const out = [];
  for (const cat of dviCategories) {
    for (const it of (cat?.dvi_items || [])) {
      const f = normalizeFinding(it);
      if (f && (f.status === "red" || f.status === "yellow")) out.push(f);
    }
  }
  return out;
}

/**
 * Main parser/ingestor for Autoflow events.
 * - body is the parsed JSON from the webhook (may be nested under .content)
 * - headers are stored only in WebhookLog; we don’t need them here
 */
export async function parseAutoflowEvent(body) {
  const root = body?.content || body || {};
  const vin =
    root.vin ||
    root.vehicle_vin ||
    root.vehicle?.vin ||
    "";

  if (!vin) return { ok: false, reason: "VIN missing" };

  // Try to detect event type and date
  const eventType =
    root?.event?.type ||
    (Array.isArray(root.dvis) ? "dvi_completed" : "chat_update"); // rough default

  let eventDate =
    root?.event?.timestamp ||
    root?.completed_datetime ||
    root?.dvis?.[0]?.completed_datetime ||
    new Date().toISOString();

  const visitId = String(
    root.remote_ticket_id ||
    root.remote_ticket ||
    root.invoice ||
    root.roNumber ||
    root.ro ||
    ""
  );

  const mileage = toNumber(root.mileage || root.vehicle_mileage || root.vehicle?.mileage || 0);

  // Upsert vehicle minimal fields
  await Vehicle.updateOne(
    { vin },
    {
      $setOnInsert: { vin },
      $set: {
        year: root.year ?? undefined,
        make: root.make ?? undefined,
        model: root.model ?? undefined,
        plate: root.license ?? undefined,
      },
    },
    { upsert: true }
  );

  // Odometer point (if present)
  let odoInserted = false;
  if (mileage > 0) {
    const d = dateOnly(new Date(eventDate));
    const exists = await OdometerPoint.findOne({ vin, date: d, miles: mileage }).lean();
    if (!exists) {
      await OdometerPoint.create({ vin, date: d, miles: mileage });
      odoInserted = true;
    }
  }

  // DVI findings
  let findingsInserted = 0;
  if (Array.isArray(root.dvis) && root.dvis.length > 0) {
    const first = root.dvis[0];
    const findings = extractFindingsFromDviCategories(first?.dvi_category || []);

    if (findings.length) {
      if (visitId) {
        await InspectionFinding.deleteMany({ vin, visitId });
        const docs = findings.map(f => ({ vin, visitId, code: f.code, label: f.label, status: f.status, notes: f.notes }));
        const res = await InspectionFinding.insertMany(docs);
        findingsInserted = res.length;
      } else {
        for (const f of findings) {
          const res = await InspectionFinding.updateOne(
            { vin, code: f.code },
            { $set: { label: f.label, status: f.status, notes: f.notes } },
            { upsert: true }
          );
          if (res.upsertedCount || res.modifiedCount) findingsInserted += 1;
        }
      }
    }
  }

  // Write compact ServiceEvent row
  await ServiceEvent.create({
    vin,
    type: normStr(eventType),
    date: new Date(eventDate),
    mileage: mileage || undefined,
    visitId: visitId || undefined,
    source: "autoflow",
    // Store only a trimmed payload to keep docs small
    payload: {
      summary: {
        dvis: Array.isArray(root.dvis) ? root.dvis.length : 0,
        customer: take(root, ["customer_firstname", "customer_lastname", "customer_id"]),
      },
      event: take(root.event || {}, ["id", "type"]),
    },
  });

  return {
    ok: true,
    vin,
    eventType,
    eventDate,
    visitId: visitId || null,
    mileage: mileage || null,
    odoInserted,
    findingsInserted,
  };
}
