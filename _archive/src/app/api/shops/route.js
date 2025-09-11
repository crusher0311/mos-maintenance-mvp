import { NextResponse } from "next/server";
import clientPromise from "../../../lib/mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2),
  autoflowBaseUrl: z.string().url().optional(),
  autoflowApiKey: z.string().optional(),
  autoflowApiPassword: z.string().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db();

  const filter =
    session.user.role === "admin"
      ? {}
      : { ownerEmail: session.user.email.toLowerCase() };

  const shops = await db
    .collection("shops")
    .find(filter, { projection: { autoflowApiPassword: 0, autoflowApiKey: 0 } })
    .toArray();

  return NextResponse.json({ shops });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    body = await req.json();
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    body = Object.fromEntries(formData.entries());
  } else {
    // Fallback (helps during tests without explicit content-type)
    body = await req.json().catch(() => ({}));
  }

  const data = createSchema.parse({
    name: body.name,
    autoflowBaseUrl: body.autoflowBaseUrl || undefined,
    autoflowApiKey: body.autoflowApiKey || undefined,
    autoflowApiPassword: body.autoflowApiPassword || undefined,
  });

  const client = await clientPromise;
  const db = client.db();

  const doc = {
    name: data.name,
    ownerEmail: session.user.email.toLowerCase(),
    autoflowBaseUrl: data.autoflowBaseUrl || null,
    autoflowApiKey: data.autoflowApiKey || null,
    autoflowApiPassword: data.autoflowApiPassword || null,
    createdAt: new Date(),
  };

  const { insertedId } = await db.collection("shops").insertOne(doc);

  await db.collection("users").updateOne(
    { email: session.user.email.toLowerCase() },
    { $addToSet: { shopIds: insertedId } }
  );

  // Smooth UX for form submissions from the dashboard page
  return NextResponse.redirect(new URL("/dashboard", req.url));
}

