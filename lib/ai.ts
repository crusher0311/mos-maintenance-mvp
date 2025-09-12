// lib/ai.ts
import OpenAI from "openai";

// Curate the models you want to allow in the dropdown.
// Feel free to add/remove to match what your account has enabled.
export const MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
];

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var.");
  return new OpenAI({ apiKey });
}

// Default model when nothing is chosen / provided
export const DEFAULT_MODEL = process.env.OPENAI_MODEL || MODELS[0];
