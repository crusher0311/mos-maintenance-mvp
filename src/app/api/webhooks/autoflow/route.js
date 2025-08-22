// src/app/api/webhooks/autoflow/route.js
import { dbConnect } from "@/lib/db";
import { Vehicle, OdometerPoint, InspectionFinding } from "@/lib/models";
import { readConfig } from "@/lib/config"; // optional: if you created config.js earlier

/** -----------------------------
 *  Helpers
 *  ----------------------------- */
function toNumber(x) {
  const n = Number(String(x ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Autoflow: item_status: "0"=red, "1"=yellow, "2"=green
function normalizeFinding(item) {
  const raw = String(item?.item_status ?? "").trim();
  let status = "";
  if (raw === "0") status = "red";
  else if (raw === "1") status = "yellow";
  else if (raw === "2") status = "green";
  else return null; // ignore if unknown

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

/** -----------------------------
 *  Webhook
 *  ----------------------------- */
export async function POST(req) {
  try {
    // --- Optional shared-secret header check (MVP) ---
    // If you saved a token at /settings, this enforces it:
    try {
      const tokenHeader = req.headers.get("x-autoflow-token") || "";
      const cfg = readConfig?.() || {};
      if (cfg.autoflowWebhookToken) {
        if (tokenHeader !== cfg.autoflowWebhookToken) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
      }
    } catch (_) {
      // If config.js wasn't added, skip auth (dev only)
    }

    // Parse payload (Autoflow sometimes nests under "content")
    const body = await req.json();
    const root = body?.content || body || {};

    const vin =
      root.vin ||
      root.vehicle_vin ||
      root.vehicle?.vin ||
      "";

    const mileage = toNumber(root.mileage || root.vehicle_mileage || root.vehicle?.mileage || 0);

    // DVI bits
    let completedAt = null;
    let findings = [];
    let visitId = String(root.remote_ticket_id || root.remote_ticket || root.invoice || root.roNumber || root.ro || "");

    if (Array.isArray(root.dvis) && root.dvis.length > 0) {
      const first = root.dvis[0];
      if (first?.completed_datetime) {
        completedAt = new Date(String(first.completed_datetime));
      }
      findings = extractFindingsFromDviCategories(first?.dvi_category || []);
    }
    if (!completedAt) {
      completedAt = root.completed_datetime ? new Date(String(root.completed_datetime)) : new Date();
    }

    if (!vin) {
      return Response.json({ error: "VIN missing" }, { status: 400 });
    }

    await dbConnect();

    // --- Upsert vehicle record (minimal for now) ---
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

    // --- Insert an odometer point if we have mileage ---
    let odoDoc = null;
    if (mileage > 0) {
      const dateOnly = new Date(completedAt);
      // normalize to start-of-day for de-dupe
      dateOnly.setUTCHours(0, 0, 0, 0);

      // Prevent duplicates on same (vin, date, miles)
      const existing = await OdometerPoint.findOne({ vin, date: dateOnly, miles: mileage }).lean();
      if (!existing) {
        odoDoc = await OdometerPoint.create({ vin, date: dateOnly, miles: mileage });
      }
    }

    // --- Upsert findings (optional: per visit if present) ---
    let inserted = 0;
    if (findings.length) {
      // If visitId present, prefer writing findings tied to that visit; else per-VIN generic.
      if (visitId) {
        // Remove prior findings for this visit to keep list current
        await InspectionFinding.deleteMany({ vin, visitId });
        const docs = findings.map(f => ({
          vin,
          visitId,
          code: f.code,
          label: f.label,
          status: f.status,
          notes: f.notes,
        }));
        const res = await InspectionFinding.insertMany(docs);
        inserted = res.length;
      } else {
        // No visit id → upsert by {vin, code, status/label/notes}
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

    return Response.json({
      ok: true,
      vin,
      mileage,
      visitId: visitId || null,
      findingsCount: findings.length,
      findingsInsertedOrUpdated: inserted,
      odometerInserted: Boolean(odoDoc),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
