// lib/models/customers.ts  (inside upsertCustomerFromAutoflowEvent)
  // ...
  if (!externalId && !email && !phone && !derivedName) {
    // Nothing reliable to identify this customer — skip writing
    return;
  }
