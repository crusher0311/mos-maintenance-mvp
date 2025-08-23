// src/lib/autoflowClient.js
import { readConfig } from "./config";

/**
 * Build Authorization headers for Autoflow.
 * - Primary: HTTP Basic (apiKey:apiPassword)
 * - Optional: an extra API-key header if your tenant requires it (e.g., "X-API-KEY")
 */
function buildBasicAuth(apiKey, apiPassword) {
  if (!apiKey || !apiPassword) return null;
  const base64 = Buffer.from(`${apiKey}:${apiPassword}`, "ascii").toString("base64");
  return `Basic ${base64}`;
}

export function buildAutoflowHeaders() {
  const { autoflowApiHeader, autoflowApiKey, autoflowApiPassword } = readConfig();
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  const basic = buildBasicAuth(autoflowApiKey, autoflowApiPassword);
  if (basic) headers["Authorization"] = basic;

  if (autoflowApiHeader && autoflowApiKey) {
    headers[autoflowApiHeader] = autoflowApiKey;
  }

  return headers;
}

// Note: We intentionally do NOT export any fetch* functions here.
// Autoflow /api/v1/history/ is for pushing data TO Autoflow, not reading from it.
// We’ll rely on webhooks (ingest) and Carfax (read) for MVP.

