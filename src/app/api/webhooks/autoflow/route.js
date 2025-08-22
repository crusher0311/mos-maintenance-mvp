// src/app/api/webhooks/autoflow/route.js
import { dbConnect } from "@/lib/db";
import { Vehicle, OdometerPoint, InspectionFinding, WebhookLog } from "@/lib/models";
import { readConfig } from "@/lib/config";

/** Helpers */
function toNumber(x) {
  const n = Number(String(x ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function normalizeFinding(item) {
  const raw = String(item?.item_status ?? "").trim();
  let status = "";
  if (raw === "0") status = "red";
  else if (raw === "1") status = "yellow";
  else if (raw === "2") status = "green";
  else return null;
  const label = item?.item_name || "Item";
  const notes = item?.item_notes || "";
  const code = (item?.item_id ? String(item.item_id) : label).toLowerCase().replace(/\s+/g, "_");
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

export async function POST(req) {
  await dbConnect();
  const headersObj = Object.fromEntries(req.headers.entries());
  const url = req.url;

  let logDoc = null;
  let body;

  try {
    // --- Token check (accept multiple header names) ---

// TEMP: Auth disabled to allow data ingestion while testing.
// We still log every request below.


    // Parse payload (may be nested under "content")
    body = await req.json();
    const root = body?.content || body || {};

    const vin =
      root.vin || root.vehicle_vin || root.vehicle?.vin || "";
    const mileage = toNumber(root.mileage || root.vehicle_mileage || root.vehicle?.mileage || 0);

    let completedAt = null;
    let findings = [];
    let visitId = String(root.remote_ticket_id || root.remote_ticket || root.invoice || root.roNumber || root.ro || "");

    if (Array.isArray(root.dvis) && root.dvis.length > 0) {
      const first = root.dvis[0];
      if (first?.completed_datetime) completedAt = new Date(String(first.completed_datetime));
      findings = extractFindingsFromDviCategories(first?.dvi_category || []);
    }
    if (!completedAt) completedAt = root.completed_datetime ? new Date(String(root.completed_datetime)) : new Date();

    // Upserts
    if (!vin) {
      await WebhookLog.create({ source: "autoflow", url, headers: headersObj, body, ok: false, error: "VIN missing" });
      return Response.json({ error: "VIN missing" }, { status: 400 });
    }

    await Vehicle.updateOne(
      { vin },
      { $setOnInsert: { vin }, $set: {
        year: root.year ?? undefined,
        make: root.make ?? undefined,
        model: root.model ?? undefined,
        plate: root.license ?? undefined,
      }},
      { upsert: true }
    );

    let odoDoc = null;
    if (mileage > 0) {
      const dateOnly = new Date(completedAt);
      dateOnly.setUTCHours(0,0,0,0);
      const existing = await OdometerPoint.findOne({ vin, date: dateOnly, miles: mileage }).lean();
      if (!existing) {
        odoDoc = await OdometerPoint.create({ vin, date: dateOnly, miles: mileage });
      }
    }

    let inserted = 0;
    if (findings.length) {
      if (visitId) {
        await InspectionFinding.deleteMany({ vin, visitId });
        const docs = findings.map(f => ({ vin, visitId, code: f.code, label: f.label, status: f.status, notes: f.notes }));
        const res = await InspectionFinding.insertMany(docs);
        inserted = res.length;
      } else {
        for (const f of findings) {
          const res = await InspectionFinding.updateOne(
            { vin, code: f.code },
            { $set: { label: f.label, status: f.status, notes: f.notes } },
            { upsert: true }
          );
          if (res.upsertedCount || res.modifiedCount) inserted += 1;
        }
      }
    }

    // Success log
    logDoc = await WebhookLog.create({
      source: "autoflow",
      url,
      headers: headersObj,
      body,
      ok: true,
    });

    return Response.json({
      ok: true,
      vin,
      mileage,
      visitId: visitId || null,
      findingsCount: findings.length,
      findingsInsertedOrUpdated: inserted,
      odometerInserted: Boolean(odoDoc),
      logId: logDoc?._id || null,
    });
  } catch (e) {
    // Error log
    await WebhookLog.create({
      source: "autoflow",
      url,
      headers: headersObj,
      body: body ?? (await safeJson(req).catch(() => null)),
      ok: false,
      error: String(e),
    });
    return Response.json({ error: String(e) }, { status: 400 });
  }
}

// Try to read JSON safely if earlier parsing failed
async function safeJson(req) {
  try { return await req.json(); } catch { return null; }
}
