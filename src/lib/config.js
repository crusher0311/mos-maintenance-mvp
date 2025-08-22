// src/lib/config.js
// Dev-friendly config store that prefers a local JSON file, with env fallbacks.
// NEVER commit config.json (it's gitignored by default via Next.js .gitignore)
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "config.json");

export function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      const cfg = JSON.parse(raw || "{}");
      return {
        autoflowBaseUrl: process.env.AUTOFLOW_BASE_URL || cfg.autoflowBaseUrl || "",
        autoflowApiKey: process.env.AUTOFLOW_API_KEY || cfg.autoflowApiKey || "",
        autoflowWebhookToken: process.env.AUTOFLOW_WEBHOOK_TOKEN || cfg.autoflowWebhookToken || "",
      };
    }
  } catch {}
  return {
    autoflowBaseUrl: process.env.AUTOFLOW_BASE_URL || "",
    autoflowApiKey: process.env.AUTOFLOW_API_KEY || "",
    autoflowWebhookToken: process.env.AUTOFLOW_WEBHOOK_TOKEN || "",
  };
}

export function writeConfig(nextCfg = {}) {
  const current = readConfig();
  const merged = { ...current, ...nextCfg };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
