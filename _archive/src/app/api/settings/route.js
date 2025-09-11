import { readConfig, writeConfig } from "@/lib/config";

export async function GET() {
  const cfg = readConfig();
  return Response.json({
    autoflowBaseUrl: cfg.autoflowBaseUrl || "",
    autoflowApiHeader: cfg.autoflowApiHeader || "X-API-KEY",
    autoflowApiKey: cfg.autoflowApiKey ? "*****" : "",
    autoflowApiPassword: cfg.autoflowApiPassword ? "*****" : "",
    autoflowWebhookToken: cfg.autoflowWebhookToken ? "*****" : "",
  });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const saved = writeConfig({
      ...(body.autoflowBaseUrl !== undefined ? { autoflowBaseUrl: body.autoflowBaseUrl } : {}),
      ...(body.autoflowApiHeader !== undefined ? { autoflowApiHeader: body.autoflowApiHeader } : {}),
      ...(body.autoflowApiKey !== undefined ? { autoflowApiKey: body.autoflowApiKey } : {}),
      ...(body.autoflowApiPassword !== undefined ? { autoflowApiPassword: body.autoflowApiPassword } : {}),
      ...(body.autoflowWebhookToken !== undefined ? { autoflowWebhookToken: body.autoflowWebhookToken } : {}),
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
