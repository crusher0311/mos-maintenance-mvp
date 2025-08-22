// src/app/api/settings/route.js
import { readConfig, writeConfig } from "@/lib/config";

export async function GET() {
  const cfg = readConfig();
  // Do not leak secrets in plain GET if you later expose publicly.
  return Response.json({
    autoflowBaseUrl: cfg.autoflowBaseUrl || "",
    // mask the key in GET for safety
    autoflowApiKey: cfg.autoflowApiKey ? "*****" : "",
    autoflowWebhookToken: cfg.autoflowWebhookToken ? "*****" : "",
  });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { autoflowBaseUrl, autoflowApiKey, autoflowWebhookToken } = body || {};
    const saved = writeConfig({
      ...(autoflowBaseUrl !== undefined ? { autoflowBaseUrl } : {}),
      ...(autoflowApiKey !== undefined ? { autoflowApiKey } : {}),
      ...(autoflowWebhookToken !== undefined ? { autoflowWebhookToken } : {}),
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
