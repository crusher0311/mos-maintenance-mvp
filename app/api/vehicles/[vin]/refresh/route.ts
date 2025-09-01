// app/api/vehicles/[vin]/refresh/route.ts
import { NextResponse, NextRequest } from "next/server";
import { getDb } from "@/lib/mongo";
import { importDVI } from "@/lib/integrations/dvi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readInputs(req: NextRequest, vinParam: string) {
  const vin = vinParam?.toUpperCase();

  if (req.method === "POST") {
    // Try FormData first
    try {
      const fd = await req.formData();
      const shopId = Number(fd.get("shopId"));
      const customerExternalId = String(fd.get("customerExternalId") || "");
      if (vin && Number.isFinite(shopId) && customerExternalId) {
        return { vin, shopId, customerExternalId };
      }
    } catch {}
    // Fallback to JSON body
    try {
      const j = await req.json();
      const shopId = Number(j?.shopId);
      const customerExternalId = j?.customerExternalId ? String(j.customerExternalId) : "";
      if (vin && Number.isFinite(shopId) && customerExternalId) {
        return { vin, shopId, customerExternalId };
      }
    } catch {}
    return { error: "Missing vin/shopId/customerExternalId in POST body." };
  }

  if (req.method === "GET") {
    const qp = req.nextUrl.searchParams;
    const shopId = Number(qp.get("shopId"));
    const customerExternalId = String(qp.get("customerExternalId") || "");
    if (vin && Number.isFinite(shopId) && customerExternalId) {
      return { vin, shopId, customerExternalId };
    }
    return { error: "For GET testing, pass ?shopId=###&customerExternalId=XXXX" };
  }

  return { error: "Method not allowed." };
}

export async function POST(req: NextRequest, ctx: { params: { vin: string } }) {
  return handle(req, ctx);
}
export async function GET(req: NextRequest, ctx: { params: { vin: string } }) {
  return handle(req, ctx);
}

async function handle(req: NextRequest, ctx: { params: { vin: string } }) {
  try {
    const vinParam = ctx.params.vin;
    const parsed = await readInputs(req, vinParam);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { vin, shopId, customerExternalId } = parsed;
    const db = await getDb();
    const now = new Date();

    // Most recent ticket for RO#
    const ticket = await db.collection("tickets").findOne(
      { shopId, vin },
      { sort: { updatedAt: -1 }, projection: { roNumber: 1 } }
    );
    const ro = ticket?.roNumber ? String(ticket.roNumber) : null;

    await db.collection("jobs").insertOne({
      type: "vehicle-refresh",
      shopId,
      vin,
      customerExternalId,
      status: "running",
      startedAt: now,
      updatedAt: now,
    });

    // Step 1: DVI import (if we have RO)
    let dviSummary: any = { skipped: true };
    if (ro) {
      try {
        const res = await importDVI({ shopId, roNumber: ro });
        dviSummary = { inserted: res.insertedCount };
      } catch (e: any) {
        dviSummary = { error: String(e?.message || e) };
        await db.collection("jobs").insertOne({
          type: "vehicle-refresh-error",
          shopId,
          vin,
          customerExternalId,
          stage: "dvi",
          error: dviSummary.error,
          at: new Date(),
        });
      }
    } else {
      await db.collection("jobs").insertOne({
        type: "vehicle-refresh-note",
        shopId,
        vin,
        customerExternalId,
        note: "No RO# found for VIN; skipped DVI.",
        at: new Date(),
      });
    }

    await db.collection("jobs").updateMany(
      { type: "vehicle-refresh", shopId, vin, customerExternalId, status: "running" },
      { $set: { status: "done", updatedAt: new Date() } }
    );

    // -------- Fixed redirect: build absolute URL from req.url --------
    if (req.method === "POST") {
      const { origin } = new URL(req.url);
      const dest =
        `${origin}/dashboard/customers/` +
        `${encodeURIComponent(customerExternalId)}/vehicles/${encodeURIComponent(vin)}?refreshed=1`;

      return NextResponse.redirect(dest, { status: 303 });
    }

    // For GET testing: return JSON
    return NextResponse.json({
      ok: true,
      vin,
      shopId,
      roNumber: ro,
      dvi: dviSummary,
    });
  } catch (err: any) {
    console.error("vehicle refresh error", err);
    const details = typeof err?.message === "string" ? err.message : undefined;
    return NextResponse.json({ error: "Server error", details }, { status: 500 });
  }
}
