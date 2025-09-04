import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { shopId, autoflowDomain, autoflowApiKey, autoflowApiPassword } = body || {};
    const session = await requireSession();

    if (Number(session.shopId) !== Number(shopId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // normalize domain (strip protocol, path, trailing slash)
    const domain = String(autoflowDomain || "")
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/[./]+$/, "");

    const db = await getDb();
    await db.collection("shops").updateOne(
      { shopId: Number(shopId) },
      {
        $set: {
          autoflowDomain: domain,
          autoflowApiKey: String(autoflowApiKey || ""),
          autoflowApiPassword: String(autoflowApiPassword || ""),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
