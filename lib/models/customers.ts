// lib/models/customers.ts
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo";

type RawPayload = any;

/* ------------------------------------------------------------------ */
/* ----------------------------- utils ------------------------------ */
/* ------------------------------------------------------------------ */

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

function cleanPersonToken(s?: unknown): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // strip trailing asterisks or noise, e.g. "Michael*"
  const cleaned = t.replace(/\*+$/g, "").trim();
  return cleaned || null;
}

function looksLikeCompany(s?: string | null): boolean {
  if (!s) return false;
  const x = s.toLowerCase();

  const keywords = [
    " llc", " inc", " co", " corp", " corporation", " company", " ltd", " llp",
    " laboratory", " laboratories", " clinic", " collision", " electric",
    " university", " hospital", " pathology", " services", " auto ", " repair",
  ];
  if (keywords.some((k) => x.includes(k))) return true;

  const wordCount = x.split(/\s+/).filter(Boolean).length;
  return wordCount >= 2;
}

const CLOSED_SET = ["closed", "Close", "CLOSED", "Appointment"] as const;
type ClosedWord = typeof CLOSED_SET[number];

function normalizeStatus(s?: string | null): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  if (["close", "closed"].includes(t.toLowerCase())) return "closed";
  return t; // keep original casing for non-closed statuses (e.g., Checkin, Servicing, Ready)
}

/* ------------------------------------------------------------------ */
/* --------------------------- extractors --------------------------- */
/* ------------------------------------------------------------------ */

function extractCustomer(payload: RawPayload) {
  const a = payload?.data?.customer; // e.g., { event: 'customer.created', data: { customer: {...} } }
  const b = payload?.customer;       // e.g., status_update / dvi_signoff_update shape

  let externalId: string | null = null;
  let first: string | null = null;
  let last: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let name: string | null = null;

  if (a) {
    externalId = a?.id != null ? String(a.id) : null;
    first = cleanPersonToken(a?.firstName);
    last  = cleanPersonToken(a?.lastName);
    email = normalizeEmail(a?.email);
    phone = normalizePhone(a?.phone);
    if (a?.name && String(a.name).trim()) name = String(a.name).trim();
  } else if (b) {
    externalId = b?.id != null ? String(b.id) : (b?.remote_id != null ? String(b.remote_id) : null);
    first = cleanPersonToken(b?.firstname);
    last  = cleanPersonToken(b?.lastname);

    if (Array.isArray(b?.phone_numbers) && b.phone_numbers.length > 0) {
      const mobile = b.phone_numbers.find((p: any) => String(p?.phone_type).toUpperCase() === "M");
      const pick   = mobile ?? b.phone_numbers[0];
      phone = normalizePhone(pick?.phonenumber);
    }
    email = normalizeEmail(b?.email);
    if (b?.name && String(b.name).trim()) name = String(b.name).trim();
  }

  if (!name && !first && looksLikeCompany(last)) {
    name = last;
    last = null;
  }
  if (!name) {
    const joined = [first ?? "", last ?? ""].filter(Boolean).join(" ").trim();
    name = joined || null;
  }

  return { externalId, first, last, name, email, phone };
}

function extractVehicleTicket(payload: RawPayload) {
  const ticket = payload?.ticket;
  const vehicle = payload?.vehicle;

  const roNumber = ticket?.invoice ?? ticket?.id ?? null; // prefer invoice
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

/* ------------------------------------------------------------------ */
/* ---------------------------- upserts ----------------------------- */
/* ------------------------------------------------------------------ */

/**
 * Rich upsert used by data model (vehicles/repair_orders + last* fields on customer).
 */
export async function upsertCustomerFromAutoflow(shopId: number, payload: RawPayload) {
  const db = await getDb();

  const { externalId, first, last, name, email, phone } = extractCustomer(payload);
  const { roNumber, vin, mileage, ticketStatus, vehicleMeta } = extractVehicleTicket(payload);

  const now = new Date();

  // Guard: skip truly empty payloads
  const hasIdentity = Boolean(externalId || email || phone);
  const hasAnyName = Boolean(name || first || last);
  const hasUsefulVehicle = Boolean(vin || (vehicleMeta && (vehicleMeta.make || vehicleMeta.model)));
  const hasRO = Boolean(roNumber);
  if (!hasIdentity && !hasAnyName && !hasUsefulVehicle && !hasRO) {
    return { ok: true as const, customerId: null, vehicleId: null, roNumber: roNumber ?? null, mileage: mileage ?? null };
  }

  // Build base $set
  const baseSet: any = {
    externalId: externalId ?? null,
    firstName: first ?? null,
    lastName:  last ?? null,
    name:      name ?? null,
    email:     email ?? null,
    phone:     phone ?? null,
    updatedAt: now,
    source:    "autoflow",
  };
  if (roNumber != null) baseSet.lastRo = String(roNumber);
  if (vin != null)      baseSet.lastVin = String(vin);
  if (mileage != null)  baseSet.lastMileage = mileage;
  if (ticketStatus != null) baseSet.lastStatus = ticketStatus;
  const normalized = normalizeStatus(ticketStatus);
  if (normalized) baseSet.status = normalized;

  // Choose selector (most specific first)
  const selectors: any[] = [];
  if (externalId) selectors.push({ shopId, externalId });
  if (email)      selectors.push({ shopId, email });
  if (phone)      selectors.push({ shopId, phone });

  let customerId: ObjectId;

  if (selectors.length === 0) {
    if (!hasAnyName && !hasUsefulVehicle && !hasRO) {
      return { ok: true as const, customerId: null, vehicleId: null, roNumber: roNumber ?? null, mileage: mileage ?? null };
    }
    const ins = await db.collection("customers").insertOne({ shopId, createdAt: now, createdBy: "autoflow-webhook", ...baseSet });
    customerId = ins.insertedId;
  } else {
    const existing = await db.collection("customers").findOne({ $or: selectors }, { projection: { _id: 1 } });
    if (existing?._id) {
      customerId = existing._id;
      await db.collection("customers").updateOne(
        { _id: customerId },
        { $set: baseSet, $setOnInsert: { shopId, createdAt: now, createdBy: "autoflow-webhook" } },
      );
    } else {
      await db.collection("customers").updateOne(
        selectors[0],
        { $set: baseSet, $setOnInsert: { shopId, createdAt: now, createdBy: "autoflow-webhook" } },
        { upsert: true },
      );
      const got = await db.collection("customers").findOne(selectors[0], { projection: { _id: 1 } });
      customerId = got!._id as ObjectId;
    }
  }

  // Vehicle
  let vehicleId: ObjectId | undefined;
  if (vin) {
    const vehRes = await db.collection("vehicles").findOneAndUpdate(
      { shopId, vin },
      {
        $setOnInsert: { shopId, vin, createdAt: now },
        $set: {
          customerId,
          customerExternalId: externalId ?? null,
          lastMileage: mileage ?? undefined,
          updatedAt: now,
          source: "autoflow",
          ...(vehicleMeta ?? {}),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    vehicleId = (vehRes.value?._id as ObjectId) ?? ((vehRes as any).lastErrorObject?.upserted as ObjectId | undefined);
  }

  // RO
  if (roNumber) {
    await db.collection("repair_orders").updateOne(
      { shopId, roNumber: String(roNumber) },
      {
        $setOnInsert: { shopId, roNumber: String(roNumber), createdAt: now },
        $set: {
          customerId,
          customerExternalId: externalId ?? null,
          vehicleId: vehicleId ?? null,
          vin: vin ?? null,
          mileage: mileage ?? null,
          status: ticketStatus ?? null,
          updatedAt: now,
          source: "autoflow",
        },
      },
      { upsert: true },
    );
  }

  return { ok: true as const, customerId, vehicleId: vehicleId ?? null, roNumber: roNumber ?? null, mileage: mileage ?? null };
}

/**
 * Lightweight upsert used by webhook to keep the “open customers” list fresh.
 * - Accepts numeric or string shopId and stores it consistently as a **string** field (query helper handles both).
 * - Updates lastStatus/status, lastTicketId, last VIN/mileage/vehicle meta when present (doesn't clobber with nulls).
 */
export async function upsertCustomerFromAutoflowEvent(payload: any, shopIdRaw: string | number) {
  const db = await getDb();

  const shopIdStr = String(shopIdRaw);
  const now = new Date();

  const externalId =
    (payload?.customer?.id != null ? String(payload.customer.id) : null) ??
    (payload?.customerId != null ? String(payload.customerId) : null) ??
    (payload?.externalId != null ? String(payload.externalId) : null) ??
    null;

  const firstName =
    (cleanPersonToken(payload?.customer?.firstName) as string | null) ??
    (cleanPersonToken(payload?.firstName) as string | null) ??
    null;

  const lastName =
    (cleanPersonToken(payload?.customer?.lastName) as string | null) ??
    (cleanPersonToken(payload?.lastName) as string | null) ??
    null;

  const explicitName =
    (typeof payload?.customer?.name === "string" && payload.customer.name.trim().length > 0
      ? payload.customer.name.trim()
      : null) ??
    (typeof payload?.name === "string" && payload.name.trim().length > 0
      ? payload.name.trim()
      : null) ??
    null;

  let derivedName: string | null = explicitName;
  if (!derivedName) {
    const joined = [firstName ?? "", lastName ?? ""].filter(Boolean).join(" ").trim();
    if (joined) derivedName = joined;
    else if (!firstName && looksLikeCompany(lastName)) derivedName = lastName;
    else derivedName = null;
  }

  const emailRaw =
    (typeof payload?.customer?.email === "string" ? payload.customer.email : null) ??
    (typeof payload?.email === "string" ? payload.email : null) ??
    null;
  const email = normalizeEmail(emailRaw ?? undefined);

  // phone may come as customer.phone or as customer.phone_numbers[*].phonenumber
  let phone = normalizePhone(
    ((typeof payload?.customer?.phone === "string" ? payload.customer.phone : null) ??
      (typeof payload?.phone === "string" ? payload.phone : null) ??
      null) ?? undefined
  );
  if (!phone && Array.isArray(payload?.customer?.phone_numbers) && payload.customer.phone_numbers.length) {
    const mobile = payload.customer.phone_numbers.find((p: any) => String(p?.phone_type).toUpperCase() === "M");
    const pick = mobile ?? payload.customer.phone_numbers[0];
    phone = normalizePhone(pick?.phonenumber);
  }

  // Vehicle/RO/status
  const ticket = payload?.ticket ?? {};
  const vehicle = payload?.vehicle ?? {};
  const lastTicketId =
    (ticket?.invoice != null ? String(ticket.invoice) : null) ??
    (ticket?.id != null ? String(ticket.id) : null) ??
    null;

  const lastStatus = ticket?.status ? String(ticket.status) : null;
  const status = normalizeStatus(lastStatus);

  const vin = vehicle?.vin ? String(vehicle.vin).toUpperCase() : null;
  const mileage = normalizeNumber(vehicle?.odometer);
  const vehicleMeta: Record<string, any> = {};
  if (vehicle?.year != null) vehicleMeta.year = normalizeNumber(vehicle.year);
  if (vehicle?.make != null) vehicleMeta.make = vehicle.make;
  if (vehicle?.model != null) vehicleMeta.model = vehicle.model;
  if (vehicle?.license != null) vehicleMeta.license = vehicle.license;

  // Build a specific selector (externalId -> email -> phone -> name -> "(no name)")
  const selectorBase = { shopId: shopIdStr };
  let selector: Record<string, any> = { ...selectorBase };
  if (externalId != null) selector.externalId = externalId;
  else if (email) selector.email = email;
  else if (phone) selector.phone = phone;
  else if (derivedName) selector.name = derivedName;
  else selector.name = "(no name)";

  // Build $set without clobbering with nulls
  const setDoc: Record<string, any> = {
    shopId: shopIdStr,
    externalId: externalId ?? null,
    name: derivedName,
    firstName: firstName ?? null,
    lastName: lastName ?? null,
    email,
    phone,
    updatedAt: now,
    provider: "autoflow",
    lastEventAt: now,
  };
  if (lastTicketId != null) setDoc.lastTicketId = lastTicketId;
  if (lastStatus != null) setDoc.lastStatus = lastStatus;
  if (status != null) setDoc.status = status;
  if (vin) setDoc["vehicle.vin"] = vin;
  if (mileage != null) setDoc["vehicle.odometer"] = mileage;
  if (vehicleMeta.year != null) setDoc["vehicle.year"] = vehicleMeta.year;
  if (vehicleMeta.make != null) setDoc["vehicle.make"] = vehicleMeta.make;
  if (vehicleMeta.model != null) setDoc["vehicle.model"] = vehicleMeta.model;
  if (vehicleMeta.license != null) setDoc["vehicle.license"] = vehicleMeta.license;

  await db.collection("customers").updateOne(
    selector,
    {
      $setOnInsert: { createdAt: now, openedAt: now, status: status ?? "open" },
      $set: setDoc,
    },
    { upsert: true },
  );
}

/* ------------------------------------------------------------------ */
/* --------------------- dashboard query helper --------------------- */
/* ------------------------------------------------------------------ */

export type OpenCustomer = {
  _id: any;
  shopId: number | string;
  name?: string | null;
  lastStatus?: string | null;
  status?: string | null;
  lastTicketId?: string | number | null;
  updatedAt?: Date;
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    vin?: string | null;
    odometer?: number | null;
    license?: string | null;
  };
};

/**
 * Fetch rows the dashboard expects:
 *  - Accepts shopId as number or string
 *  - Excludes closed/appointment
 *  - Requires a VIN
 *  - Sorts by updatedAt desc
 */
export async function getOpenCustomersForDashboard(shopIdInput: number | string, limit = 50) {
  const db = await getDb();
  const shopIdNum = Number(shopIdInput);
  const shopIdStr = String(shopIdInput);

  const cursor = db
    .collection<OpenCustomer>("customers")
    .find(
      {
        $and: [
          { $or: [{ shopId: shopIdNum }, { shopId: shopIdStr }] },
          { status: { $nin: CLOSED_SET as unknown as ClosedWord[] } },
          { "vehicle.vin": { $exists: true, $ne: "" } },
        ],
      },
      {
        projection: {
          name: 1,
          status: 1,
          lastStatus: 1,
          lastTicketId: 1,
          updatedAt: 1,
          vehicle: { year: 1, make: 1, model: 1, vin: 1, odometer: 1, license: 1 },
        },
      },
    )
    .sort({ updatedAt: -1 })
    .limit(limit);

  return cursor.toArray();
}
