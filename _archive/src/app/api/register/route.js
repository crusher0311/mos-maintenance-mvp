import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import clientPromise from "../../../lib/mongodb";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

export async function POST(req) {
  try {
    const json = await req.json();
    const { email, password, name } = bodySchema.parse(json);

    const client = await clientPromise;
    const db = client.db();

    const existing = await db.collection("users").findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userDoc = {
      email: email.toLowerCase(),
      name,
      passwordHash,
      role: "shop",      // default role
      shopIds: [],       // empty until a shop is created/assigned
      createdAt: new Date(),
    };

    const { insertedId } = await db.collection("users").insertOne(userDoc);
    return NextResponse.json({ ok: true, userId: insertedId.toString() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

