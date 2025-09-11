// lib/models/customers.ts
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo";

type RawPayload = any;

// ------------------------ normalizers ------------------------

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

  // obvious business keywords
  const keywords = [
    " llc",
    " inc",
    " co",
    " corp",
    " corporation",
    " company",
    " ltd",
    " llp",
    " laboratory",
    " laboratories",
    " clinic",
    " collision",
    " electric",
    " university",
    " hospital",
    " pathology",
    " services",
    " auto ",
    " repair",
  ];
  if (keywords.some((k) => x.includes(k))) return true;

  // multi-word with no first name tends to be a business, e.g. "Red Bone Electric"
  const wordCount = x.split(/\s+/).filter(Boolean).length;
  return wordCount >= 2;
}

// ------------------------ extractors ------------------------

/** Extracts customer core info from multiple AutoFlow payload shapes */
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

    if (a?.name && String(a.name).trim()) {
      name = String(a.name).trim();
    }
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

    if (b?.name && String(b.name).trim()) {
      name = String(b.name).trim();
    }
  }

  // If last name is clearly a business and there is no first name, treat it as company "name"
  if (!name && !first && looksLikeCompany(last)) {
    name = last;
    last = null;
  }

  // Otherwise build from person tokens if needed
  if (!name) {
    const joined = [first ?? "", last ?? ""].filter(Boolean).join(" ").trim();
    name = joined || null;
  }

  return { externalId, first, last, name, email, phone };
}

/** Pull VIN / RO / Mileage / Status from payload shapes (status_update and similar) */
function extractVehicleTicket(payload: RawPayload) {
  const ticket = payload?.ticket;
  const vehicle = payload?.vehicle;

  const roNumber = ticket?.invoice ?? ticket?.id ?? null; // prefer invoice (looks like RO), fallback to id
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

// ------------------------ upserts ------------------------

/**
 * Upsert a customer based on AutoFlow event.
 * - Uses Mongo ObjectId relations (customerId, vehicleId) for joins
 * - Also records "last seen" VIN/RO/Mileage/Status on the customer for quick display
 * - Upserts into vehicles and repair_orders
 * - **Guard**: do not create junk rows when the payload has no meaningful identity/content
 */
export async function upsertCustomerFromAutoflow(shopId: number, payload: RawPayload) {
  const db = await getDb();

  const { externalId, first, last, name, email, phone } = extractCustomer(payload);
  const { roNumber, vin, mileage, ticketStatus, vehicleMeta } = extractVehicleTicket(payload);

  const now = new Date();

  // ---------- Guard: skip empty payloads ----------
  const hasIdentity = Boolean(externalId || email || phone);
  const hasAnyName = Boolean(name || first || last);
  const hasUsefulVehicle = Boolean(vin || (vehicleMeta && (vehicleMeta.make || vehicleMeta.model)));
  const hasRO = Boolean(roNumber);

  if (!hasIdentity && !hasAnyName && !hasUsefulVehicle && !hasRO) {
    return {
      ok: true as const,
      customerId: null,
      vehicleId: null,
      roNumber: roNumber ?? null,
      mileage: mileage ?? null,
    };
  }

  // ---------- UPSERT CUSTOMER (get _id to use as FK) ----------
  const customerFilters: any[] = [];
  if (externalId) customerFilters.push({ shopId, externalId });
  if (email)      customerFilters.push({ shopId, email });
  if (phone)      customerFilters.push({ shopId, phone });

  const customerBaseSet: any = {
    externalId: externalId ?? null,
    firstName: first ?? null,
    lastName:  last ?? null,
    name:      name ?? null,
    email:     email ?? null,
    phone:     phone ?? null,
    updatedAt: now,
    source:    "autoflow",
  };
  if (roNumber != null) customerBaseSet.lastRo = String(roNumber);
  if (vin != null)      customerBaseSet.lastVin = String(vin);
  if (mileage != null)  customerBaseSet.lastMileage = mileage;
  if (ticketStatus != null) customerBaseSet.lastStatus = ticketStatus;

  let customerId: ObjectId;

  if (customerFilters.length === 0) {
    // No reliable identifier — only insert if there is *some* meaningful content
    if (!hasAnyName && !hasUsefulVehicle && !hasRO) {
      return {
        ok: true as const,
        customerId: null,
        vehicleId: null,
        roNumber: roNumber ?? null,
        mileage: mileage ?? null,
      };
    }
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
        },
      );
    } else {
      await db.collection("customers").updateOne(
        customerFilters[0],
        {
          $set: customerBaseSet,
          $setOnInsert: { shopId, createdAt: now, createdBy: "autoflow-webhook" },
        },
        { upsert: true },
      );
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
          customerId,                    // store FK as ObjectId
          customerExternalId: externalId ?? null, // optional legacy link
          lastMileage: mileage ?? undefined,
          updatedAt: now,
          source: "autoflow",
          ...(vehicleMeta ?? {}),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    vehicleId =
      (vehRes.value?._id as ObjectId) ??
      ((vehRes as any).lastErrorObject?.upserted as ObjectId | undefined);
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
      { upsert: true },
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

/**
 * Lightweight upsert used by inspection endpoint for “open” customers.
 * Matches by externalId, else email, else phone, else name.
 * (No mixing of ?? and || to keep esbuild/tsx happy.)
 */
export async function upsertCustomerFromAutoflowEvent(payload: any, shopIdRaw: string | number) {
  const db = await getDb();

  const shopIdStr = String(shopIdRaw);
  const now = new Date();

  // externalId (prefer specific fields, no || mixing)
  const externalId =
    (payload?.customer?.id != null ? String(payload.customer.id) : null) ??
    (payload?.customerId != null ? String(payload.customerId) : null) ??
    (payload?.externalId != null ? String(payload.externalId) : null) ??
    null;

  // names (cleaned)
  const firstName =
    (cleanPersonToken(payload?.customer?.firstName) as string | null) ??
    (cleanPersonToken(payload?.firstName) as string | null) ??
    null;

  const lastName =
    (cleanPersonToken(payload?.customer?.lastName) as string | null) ??
    (cleanPersonToken(payload?.lastName) as string | null) ??
    null;

  // name preference: explicit name -> joined first/last -> business last-only -> null
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
    if (joined) {
      derivedName = joined;
    } else if (!firstName && looksLikeCompany(lastName)) {
      derivedName = lastName; // business name living in lastName
    } else {
      derivedName = null;
    }
  }

  // contact details
  const emailRaw =
    (typeof payload?.customer?.email === "string" ? payload.customer.email : null) ??
    (typeof payload?.email === "string" ? payload.email : null) ??
    null;
  const email = emailRaw ? emailRaw.toLowerCase() : null;

  const phoneRaw =
    (typeof payload?.customer?.phone === "string" ? payload.customer.phone : null) ??
    (typeof payload?.phone === "string" ? payload.phone : null) ??
    null;
  const phone = phoneRaw ? phoneRaw : null;

  // Build the most specific selector we can
  const selectorBase = { shopId: shopIdStr };
  let selector: Record<string, any> = { ...selectorBase };

  if (externalId != null) {
    selector.externalId = externalId;
  } else if (email) {
    selector.email = email;
  } else if (phone) {
    selector.phone = phone;
  } else if (derivedName) {
    selector.name = derivedName;
  } else {
    selector.name = "(no name)";
  }

  await db.collection("customers").updateOne(
    selector,
    {
      $setOnInsert: {
        createdAt: now,
        openedAt: now,
        status: "open",
      },
      $set: {
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
      },
    },
    { upsert: true },
  );
}
