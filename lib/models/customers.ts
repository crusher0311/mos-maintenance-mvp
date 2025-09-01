// lib/models/customers.ts
import { getDb } from "@/lib/mongo";

/** Best-effort extraction from common webhook shapes. */
function extractCustomer(payload: any) {
  // Try nested customer object first
  const c = payload?.customer ?? payload?.data?.customer ?? null;

  const externalId =
    c?.id ??
    payload?.customerId ??
    payload?.data?.customerId ??
    payload?.data?.customer_id ??
    null;

  const email =
    c?.email ??
    payload?.email ??
    payload?.data?.email ??
    null;

  const phone =
    c?.phone ??
    c?.phoneNumber ??
    payload?.phone ??
    payload?.data?.phone ??
    null;

  const firstName =
    c?.firstName ??
    c?.first_name ??
    payload?.firstName ??
    payload?.data?.firstName ??
    null;

  const lastName =
    c?.lastName ??
    c?.last_name ??
    payload?.lastName ??
    payload?.data?.lastName ??
    null;

  const fullName =
    c?.name ??
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    null;

  if (!externalId && !email && !phone) {
    return null; // not enough to identify a customer
  }

  return {
    externalId: externalId ?? null,
    email: email ?? null,
    phone: phone ?? null,
    firstName: firstName ?? null,
    lastName: lastName ?? null,
    name: fullName ?? null,
  };
}

/** Upsert a customer by (shopId, externalId) or fallback on email. */
export async function upsertCustomerFromAutoflow(shopId: number, payload: any) {
  const customer = extractCustomer(payload);
  if (!customer) return { ok: false, reason: "no-customer-fields" };

  const db = await getDb();
  const col = db.collection("customers");

  const emailLower = customer.email ? String(customer.email).toLowerCase() : null;

  // Build a stable query: prefer externalId when present, else (shopId + email)
  const query: any = { shopId };
  if (customer.externalId) {
    query.externalId = String(customer.externalId);
  } else if (emailLower) {
    query.emailLower = emailLower;
  } else {
    // Shouldn't happen due to earlier guard
    return { ok: false, reason: "no-keys" };
  }

  const update: any = {
    $set: {
      shopId,
      externalId: customer.externalId ? String(customer.externalId) : null,
      email: customer.email ?? null,
      emailLower,
      phone: customer.phone ?? null,
      firstName: customer.firstName ?? null,
      lastName: customer.lastName ?? null,
      name: customer.name ?? null,
      updatedAt: new Date(),
    },
    $setOnInsert: {
      createdAt: new Date(),
    },
  };

  await col.updateOne(query, update, { upsert: true });
  return { ok: true };
}
