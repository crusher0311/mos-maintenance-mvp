// lib/models/customers.ts
import { ObjectId } from "mongodb";
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
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Extracts customer core info from multiple AutoFlow payload shapes */
function extractCustomer(payload: RawPayload) {
  const a = payload?.data?.customer; // e.g., { event: 'customer.created', data: { customer: {...} } }
  const b = payload?.customer;       // e.g., status_update / dvi_signoff_update shape

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
  return { externalId, first, last, name, email, phone };
}

/** Pull VIN / RO / Mileage / Status from payload shapes (status_update and similar) */
function extractVehicleTicket(payload: RawPayload) {
  const ticket = payload?.ticket;
  const vehicle = payload?.vehicle;

  const roNumber =
    ticket?.invoice ?? ticket?.id ?? null; // prefer invoice (looks like your RO), fallback to id
  const vin = vehicle?.vin ?? null;
  const mileage = normalizeNumber(vehicle?.odometer);
  const ticketStatus = ticket?.status ?? null;

  return {
    roNumber: roNumber != null ? String(roNumber) : null,
    vin: vin != null ? String(vin).toUpperCase() : null,
    mileage,
    ticketStatus: ticketStatus != null ? String(ticketStatus) : null,
    vehicleMeta: vehicle
      ? {
          year: normalizeNumber(vehicle.year) ?? undefined,
          make: vehicle.make ?? undefined,
          model: vehicle.model ?? undefined,
          license: vehicle.license ?? undefined,
        }
      : undefined,
  };
}

/**
 * Upsert a customer based on AutoFlow event.
 * - Uses Mongo ObjectId relations (customerId, vehicleId) for joins
 * - Also records "last seen" VIN/RO/Mileage/Status on the customer for quick display
 * - Upserts into vehicles and repair_orders
 */
export async function upsertCustomerFromAutoflow(shopId: number, payload: RawPayload) {
  const db = await getDb();

  const { externalId, first, last, name, email, phone } = extractCustomer(payload);
  const { roNumber, vin, mileage, ticketStatus, vehicleMeta } = extractVehicleTicket(payload);

  const now = new Date();

  // ---------- UPSERT CUSTOMER (get _id to use as FK) ----------
  const customerFilters: any[] = [];
  if (externalId) customerFilters.push({ shopId, externalId });
  if (email)      customerFilters.push({ shopId, email });
  if (phone)      customerFilters.push({ shopId, phone });

  const customerBaseSet: any = {
    externalId: externalId ?? null,
    firstName: first ?? null,
    lastName: last ?? null,
    name: name ?? null,
    email: email ?? null,
    phone: phone ?? null,
    updatedAt: now,
    source: "autoflow",
  };
  if (roNumber != null) customerBaseSet.lastRo = String(roNumber);
  if (vin != null)      customerBaseSet.lastVin = String(vin);
  if (mileage != null)  customerBaseSet.lastMileage = mileage;
  if (ticketStatus != null) customerBaseSet.lastStatus = ticketStatus;

  let customerId: ObjectId;

  if (customerFilters.length === 0) {
    // create a new customer if we truly have no keys
    const ins = await db.collection("customers").insertOne({
      shopId,
      ...customerBaseSet,
      createdAt: now,
      createdBy: "autoflow-webhook",
    });
    customerId = ins.insertedId;
  } else {
    const existing = await db
      .collection("customers")
      .findOne({ $or: customerFilters }, { projection: { _id: 1 } });

    if (existing?._id) {
      customerId = existing._id;
      await db.collection("customers").updateOne(
        { _id: customerId },
        {
          $set: customerBaseSet,
          $setOnInsert: { shopId, createdAt: now, createdBy: "autoflow-webhook" },
        }
      );
    } else {
      const res = await db.collection("customers").updateOne(
        customerFilters[0],
        {
          $set: customerBaseSet,
          $setOnInsert: { shopId, createdAt: now, createdBy: "autoflow-webhook" },
        },
        { upsert: true }
      );
      // fetch the id regardless of branch
      const got = await db
        .collection("customers")
        .findOne(customerFilters[0], { projection: { _id: 1 } });
      customerId = got!._id as ObjectId;
    }
  }

  // ---------- UPSERT VEHICLE (by VIN) ----------
  let vehicleId: ObjectId | undefined = undefined;

  if (vin) {
    const vehRes = await db.collection("vehicles").findOneAndUpdate(
      { shopId, vin },
      {
        $setOnInsert: { shopId, vin, createdAt: now },
        $set: {
          customerId,                    // <-- store FK as ObjectId
          customerExternalId: externalId ?? null, // optional: keep legacy link
          lastMileage: mileage ?? undefined,
          updatedAt: now,
          source: "autoflow",
          ...(vehicleMeta ?? {}),
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    vehicleId = (vehRes.value?._id as ObjectId) ??
                (vehRes as any).lastErrorObject?.upserted as ObjectId | undefined;
  }

  // ---------- UPSERT REPAIR ORDER ----------
  if (roNumber) {
    await db.collection("repair_orders").updateOne(
      { shopId, roNumber: String(roNumber) },
      {
        $setOnInsert: { shopId, roNumber: String(roNumber), createdAt: now },
        $set: {
          customerId,                           // ObjectId FK
          customerExternalId: externalId ?? null,
          vehicleId: vehicleId ?? null,
          vin: vin ?? null,
          mileage: mileage ?? null,
          status: ticketStatus ?? null,
          updatedAt: now,
          source: "autoflow",
        },
      },
      { upsert: true }
    );
  }

  return {
    ok: true as const,
    customerId,
    vehicleId: vehicleId ?? null,
    roNumber: roNumber ?? null,
    mileage: mileage ?? null,
  };
}
