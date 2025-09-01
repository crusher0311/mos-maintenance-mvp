// lib/models/customers.ts
import { getDb } from "@/lib/mongo";

type RawPayload = any;

function normalizeEmail(s?: unknown): string | null {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  return t || null;
}
function normalizePhone(s?: unknown): string | null {
  if (!s) return null;
  const digits = String(s).replace(/\D/g, "");
  return digits || null;
}
function normalizeNumber(s?: unknown): number | null {
  if (s == null) return null;
  const n = Number(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Extracts customer core info from multiple AutoFlow payload shapes */
function extractCustomer(payload: RawPayload) {
  const a = payload?.data?.customer; // e.g., { event: 'customer.created', data: { customer: {...} } }
  const b = payload?.customer;       // e.g., status_update shape

  let externalId: string | null = null;
  let first: string | null = null;
  let last: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;

  if (a) {
    externalId = a?.id != null ? String(a.id) : null;
    first = (a?.firstName ?? "")?.toString().trim() || null;
    last  = (a?.lastName  ?? "")?.toString().trim() || null;
    email = normalizeEmail(a?.email);
    phone = normalizePhone(a?.phone);
  } else if (b) {
    externalId = b?.id != null ? String(b.id) : (b?.remote_id != null ? String(b.remote_id) : null);
    first = (b?.firstname ?? "")?.toString().trim() || null;
    last  = (b?.lastname  ?? "")?.toString().trim() || null;

    if (Array.isArray(b?.phone_numbers) && b.phone_numbers.length > 0) {
      const mobile = b.phone_numbers.find((p: any) => String(p?.phone_type).toUpperCase() === "M");
      const pick   = mobile ?? b.phone_numbers[0];
      phone = normalizePhone(pick?.phonenumber);
    }
    email = normalizeEmail(b?.email);
  }

  const name = [first, last].filter(Boolean).join(" ").trim() || null;
  return { externalId, name, email, phone };
}

/** Pull VIN / RO / Mileage / Status from payload shapes (status_update and similar) */
function extractVehicleTicket(payload: RawPayload) {
  const ticket = payload?.ticket;
  const vehicle = payload?.vehicle;

  const roNumber =
    ticket?.invoice ?? ticket?.id ?? null; // prefer invoice as RO, fallback to id
  const vin = vehicle?.vin ?? null;
  const mileage = normalizeNumber(vehicle?.odometer);
  const ticketStatus = ticket?.status ?? null;

  return {
    roNumber: roNumber != null ? String(roNumber) : null,
    vin: vin != null ? String(vin) : null,
    mileage,
    ticketStatus: ticketStatus != null ? String(ticketStatus) : null,
    vehicleMeta: vehicle
      ? {
          year: vehicle.year ?? null,
          make: vehicle.make ?? null,
          model: vehicle.model ?? null,
          license: vehicle.license ?? null,
        }
      : null,
  };
}

/**
 * Upsert a customer based on AutoFlow event.
 * Also records "last seen" VIN/RO/Mileage/Status on the customer,
 * and upserts into vehicles/tickets collections for history.
 */
export async function upsertCustomerFromAutoflow(shopId: number, payload: RawPayload) {
  const db = await getDb();

  const { externalId, name, email, phone } = extractCustomer(payload);
  const { roNumber, vin, mileage, ticketStatus, vehicleMeta } = extractVehicleTicket(payload);

  // Build match filters (customer)
  const filters: any[] = [];
  if (externalId) filters.push({ shopId, externalId });
  if (email)      filters.push({ shopId, email });
  if (phone)      filters.push({ shopId, phone });

  const now = new Date();
  const baseSet: any = {
    name: name ?? null,
    email: email ?? null,
    phone: phone ?? null,
    externalId: externalId ?? null,
    updatedAt: now,
    source: "autoflow",
  };

  // "Last seen" fields for dashboard
  if (roNumber != null) baseSet.lastRo = String(roNumber);
  if (vin != null)      baseSet.lastVin = String(vin).toUpperCase();
  if (mileage != null)  baseSet.lastMileage = mileage;
  if (ticketStatus != null) baseSet.lastStatus = ticketStatus;

  const update = {
    $set: baseSet,
    $setOnInsert: {
      shopId,
      createdAt: now,
      createdBy: "autoflow-webhook",
    },
  };

  // Upsert customer
  let customerId: any = null;
  if (filters.length === 0) {
    const ins = await db.collection("customers").insertOne({
      shopId,
      ...baseSet,
      createdAt: now,
      createdBy: "autoflow-webhook",
    });
    customerId = ins.insertedId;
  } else {
    const existing = await db.collection("customers").findOne({ $or: filters }, { projection: { _id: 1 } });
    if (existing) {
      await db.collection("customers").updateOne({ _id: existing._id }, update);
      customerId = existing._id;
    } else {
      const res = await db.collection("customers").updateOne(filters[0], update, { upsert: true });
      customerId =
        res.upsertedId?._id ??
        (await db.collection("customers").findOne(filters[0], { projection: { _id: 1 } }))?._id;
    }
  }

  // Optional: upsert vehicle record (by vin)
  if (vin) {
    await db.collection("vehicles").updateOne(
      { shopId, vin: String(vin).toUpperCase() },
      {
        $set: {
          customerExternalId: externalId ?? null,
          ...vehicleMeta,
          updatedAt: now,
          source: "autoflow",
        },
        $setOnInsert: {
          shopId,
          vin: String(vin).toUpperCase(),
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  // Optional: upsert ticket/RO record
  if (roNumber != null) {
    await db.collection("tickets").updateOne(
      { shopId, roNumber: String(roNumber) },
      {
        $set: {
          customerExternalId: externalId ?? null,
          vin: vin ? String(vin).toUpperCase() : null,
          mileage: mileage ?? null,
          status: ticketStatus ?? null,
          updatedAt: now,
          source: "autoflow",
        },
        $setOnInsert: {
          shopId,
          roNumber: String(roNumber),
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  return customerId;
}
