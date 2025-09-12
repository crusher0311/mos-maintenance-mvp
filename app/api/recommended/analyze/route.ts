// app/api/recommended/analyze/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { resolveAutoflowConfig, fetchDviWithCache } from "@/lib/integrations/autoflow";
import { resolveCarfaxConfig, fetchCarfaxWithCache } from "@/lib/integrations/carfax";

// If you use the official OpenAI SDK, import it. Otherwise use fetch.
// npm i openai (if not installed) and set OPENAI_API_KEY in env.
import OpenAI from "openai";

function parseCarfaxDate(d?: string | null): Date | null {
  if (!d) return null;
  const trimmed = String(d).trim();
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = Number(m[1]), dd = Number(m[2]), yy = Number(m[3]);
    const dt = new Date(yy, mm - 1, dd);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

export async function POST(req: Request) {
  try {
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const vin = String(body?.vin || "").toUpperCase().trim();
    const model = String(body?.model || "gpt-4.1-mini");

    if (!vin) {
      return NextResponse.json({ ok: false, error: "VIN is required." }, { status: 400 });
    }

    // Pull data needed for the prompt
    const db = await getDb();

    // Vehicle
    const vehicle = await db.collection("vehicles").findOne(
      { vin },
      { projection: { year: 1, make: 1, model: 1, lastMileage: 1, odometer: 1, customerId: 1, shopId: 1 } }
    );

    if (!vehicle?.shopId) {
      return NextResponse.json({ ok: false, error: "Vehicle or shop not found for VIN." }, { status: 404 });
    }

    const shopId = Number(vehicle.shopId);

    // Latest RO
    const ro = await db
      .collection("repair_orders")
      .find({ $or: [{ vin }, { vehicleId: vehicle._id }] })
      .project({ roNumber: 1, status: 1, mileage: 1, updatedAt: 1, createdAt: 1 })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1)
      .next();

    // DVI
    const afCfg = await resolveAutoflowConfig(shopId);
    const dvi = ro?.roNumber && afCfg.configured
      ? await fetchDviWithCache(shopId, String(ro.roNumber), 10 * 60 * 1000)
      : { ok: false, error: ro?.roNumber ? "AutoFlow not connected." : "No RO found." };

    // CARFAX
    const carfaxCfg = await resolveCarfaxConfig(shopId);
    const carfax = carfaxCfg.configured
      ? await fetchCarfaxWithCache(shopId, vin, 7 * 24 * 60 * 60 * 1000)
      : { ok: false, error: "CARFAX not configured." };

    // Normalize CARFAX records for prompt
    const serviceRecords = (carfax as any)?.ok && Array.isArray((carfax as any).serviceRecords)
      ? (carfax as any).serviceRecords.map((r: any) => ({
          date: r?.date || null,
          miles: typeof r?.odometer === "number" ? r.odometer : null,
          description: r?.description || null,
          location: r?.location || null,
        }))
      : [];

    // Normalize DVI for prompt
    const dviItems: Array<{ category?: string; name?: string; status?: string | number; notes?: string }> =
      (dvi as any)?.ok && Array.isArray((dvi as any).categories)
        ? (dvi as any).categories.flatMap((c: any) =>
            Array.isArray(c.items)
              ? c.items.map((it: any) => ({
                  category: c?.name,
                  name: it?.name,
                  status: it?.status,
                  notes: it?.notes,
                }))
              : []
          )
        : [];

    // OEM schedule (already computed in vehicle pages via Mongo)
    // For the analyzer, keep it light: pull what we show on the plan page if you like.
    // Here we just pull pre-computed local schedule if present.
    // If you already have a helper, you can import and reuse it.
    // To keep this handler independent, we’ll read the flattened maintenance docs, if any were stored.
    const oemDocs = await db
      .collection("dataone_lkp_vin_maintenance")
      .find({ squish: { $exists: true } }) // NOTE: normally you'd re-run the pipeline used on the page
      .project({ _id: 0 })
      .limit(0)
      .toArray();

    // Compose a concise prompt
    const ymm = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
    const odo =
      typeof vehicle?.lastMileage === "number" && vehicle.lastMileage > 0
        ? vehicle.lastMileage
        : typeof vehicle?.odometer === "number"
        ? vehicle.odometer
        : null;

    const lines: string[] = [];
    lines.push(`Vehicle: ${ymm || "(unknown)"}${odo != null ? ` • ${odo.toLocaleString()} mi` : ""}`);
    if (ro?.roNumber) lines.push(`Latest RO: ${ro.roNumber}`);
    lines.push("");
    lines.push("DVI (condensed):");
    if (dviItems.length > 0) {
      for (const it of dviItems.slice(0, 80)) {
        lines.push(`- [${String(it.status ?? "")}] ${it.category ? it.category + " — " : ""}${it.name || ""}${it.notes ? ` • ${it.notes}` : ""}`);
      }
    } else {
      lines.push("- none");
    }
    lines.push("");
    lines.push("CARFAX service records (latest first):");
    if (serviceRecords.length > 0) {
      for (const r of serviceRecords.slice(0, 50)) {
        lines.push(`- ${r.date || ""} • ${r.miles != null ? r.miles.toLocaleString() + " mi" : ""} • ${r.description || ""}`);
      }
    } else {
      lines.push("- none");
    }
    lines.push("");
    lines.push("OEM schedule (summary if available):");
    lines.push("- Use standard maintenance intervals if specific OEM rows are not available in context.");

    const systemPrompt =
      "You are a master service advisor with decades of experience. " +
      "Given DVI, CARFAX, and OEM context, list everything you would recommend to a customer. " +
      "Prioritize the list from top to bottom, and keep each bullet clear, short, and actionable. " +
      "If a recommendation is urgent or safety-related, mark it clearly.";

    const userPrompt = lines.join("\n");

    // Call OpenAI (guard if no key)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "OpenAI API key is not configured. Set OPENAI_API_KEY in your environment to enable analysis.",
        },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    // We’ll produce a simple markdown list in the response.
    const completion = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.2,
    });

    // Extract text nicely
    const content =
      completion.output_text?.trim?.() ||
      completion?.output?.[0]?.content?.[0]?.text?.trim?.() ||
      "";

    if (!content) {
      return NextResponse.json(
        { ok: false, error: "Model returned no content." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      model,
      vin,
      vehicle: ymm,
      odometer: odo ?? null,
      roNumber: ro?.roNumber ?? null,
      markdown: content,
    });
  } catch (err: any) {
    // Always return JSON on errors
    const message = err?.message || "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
