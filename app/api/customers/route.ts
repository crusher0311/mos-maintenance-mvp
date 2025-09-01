// app/api/customers/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    let { name, email, phone, externalId } = payload || {};

    // Normalize
    name = typeof name === "string" ? name.trim() : null;
    email = typeof email === "string" ? email.trim().toLowerCase() : null;
    phone = typeof phone === "string" ? phone.trim() : null;
    externalId = typeof externalId === "string" ? externalId.trim() : null;

    // Basic validation
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const db = await getDb();
    const doc = {
      shopId: session.shopId,
      name,
      email,
      phone,
      externalId,
      createdAt: new Date(),
      createdBy: session.email,
    };

    const result = await db.collection("customers").insertOne(doc);
    return NextResponse.json({ ok: true, id: String(result.insertedId) });
  } catch (err) {
    console.error("Create customer error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
