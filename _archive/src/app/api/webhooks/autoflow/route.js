// src/app/api/webhooks/autoflow/route.js
import { dbConnect } from "@/lib/db";
import { WebhookLog } from "@/lib/models";
import { parseAutoflowEvent } from "@/lib/parsers/autoflow";

export async function POST(req) {
  await dbConnect();

  const headersObj = Object.fromEntries(req.headers.entries());
  const url = req.url;

  let body = null;

  try {
    // Auth disabled for now — just ingest and log
    body = await req.json();

    const result = await parseAutoflowEvent(body);

    // Log success/failure with trimmed info
    await WebhookLog.create({
      source: "autoflow",
      url,
      headers: headersObj,
      body: {
        ok: result.ok,
        vin: result.vin,
        eventType: result.eventType,
        visitId: result.visitId,
        mileage: result.mileage,
      },
      ok: result.ok,
      error: result.ok ? "" : (result.reason || ""),
    });

    if (!result.ok) {
      return Response.json({ error: result.reason || "Parse failed" }, { status: 400 });
    }

    return Response.json(result);
  } catch (e) {
    await WebhookLog.create({
      source: "autoflow",
      url,
      headers: headersObj,
      body,
      ok: false,
      error: String(e),
    });
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
