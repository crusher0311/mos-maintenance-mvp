// app/lib/ai/recommender.ts
/**
 * Lightweight fetch-based OpenAI caller (no SDK) to generate advisory text.
 * Safe with Zod v4 because we don't import the OpenAI SDK at all.
 */

export type AiAdvice = {
  summary: string;
  prioritized: Array<{
    task: string;
    reason: string;
    suggestedStatus?: "OVERDUE" | "DUE_NOW" | "COMING_SOON" | "FUTURE" | "QUESTIONABLE_OVERDUE";
    suggestedIntervalMiles?: number | null;
  }>;
  notes?: string[];
};

type Buckets = Record<
  "OVERDUE" | "QUESTIONABLE_OVERDUE" | "DUE_NOW" | "COMING_SOON" | "FUTURE" | "UNKNOWN",
  any[]
>;

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// Pick a small, fast, cheap model. Adjust if you have access to another.
const OPENAI_MODEL = "gpt-4o-mini";

/**
 * Call OpenAI via fetch and return AiAdvice (or null on error/missing key).
 */
export async function getAiRecommendations(
  vin: string,
  currentMileage: number,
  buckets: Buckets
): Promise<AiAdvice | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No key configured; just return null to keep the API response working.
    return null;
  }

  // Keep payload compact to reduce token usage
  const compactBuckets = compactForAi(buckets);

  const system = `
You are an expert fixed-ops maintenance advisor for automotive service shops.
Goal: given the current mileage, OE-like tasks (already bucketed), and limited/spotty history,
produce practical, conservative recommendations for a service advisor to discuss with a customer.
Rules:
- NEVER invent tasks that are unsafe or clearly not applicable.
- Prefer manufacturer-style language where possible.
- If OE schedule ends before the vehicle's current mileage, propose reasonable extrapolation:
  * Oil & filter and tire rotations: keep their shortest/normal interval from data provided.
  * For other items, suggest intervals at ~50% of the original miles if the vehicle is in high mileage territory.
  * Mark such extrapolations clearly as "shop policy suggestion" rather than OE.
- Distinguish statuses:
  OVERDUE (clearly missed), DUE_NOW (at threshold), COMING_SOON (~<=5k away),
  FUTURE (>5k away), QUESTIONABLE_OVERDUE (no history but likely missed multiple times).
- Keep responses JSON only (no commentary outside JSON).
`.trim();

  const user = {
    vin,
    currentMileage,
    buckets: compactBuckets,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000); // 20s timeout

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" }, // Ask for JSON back
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              "Return JSON with keys: summary (string), prioritized (array of {task, reason, suggestedStatus?, suggestedIntervalMiles?}), notes (array of strings, optional). " +
              "Here is the input JSON:\n" +
              JSON.stringify(user),
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      // Swallow model errorsâ€”API should keep working without AI
      return null;
    }

    const data = await res.json();
    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.message ??
      null;

    if (!content) return null;

    // The model should return JSON because we used response_format: json_object
    let parsed: AiAdvice | null = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Some models might still return plain text; try a loose parse:
      parsed = safeJsonExtract(content);
    }

    // Minimal shape guard
    if (!parsed || typeof parsed.summary !== "string" || !Array.isArray(parsed.prioritized)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Trim bucket entries so we don't blow tokens.
 * Keep only fields that help reasoning: task, intervalMiles, nextDueAt, lastDoneAt, hasHistory, status
 */
function compactForAi(buckets: Buckets): Buckets {
  const pick = (x: any) => ({
    task: x.task,
    intervalMiles: x.intervalMiles ?? null,
    nextDueAt: x.nextDueAt ?? null,
    lastDoneAt: x.lastDoneAt ?? null,
    hasHistory: !!x.hasHistory,
    status: x.status,
  });
  return {
    OVERDUE: buckets.OVERDUE.map(pick),
    QUESTIONABLE_OVERDUE: buckets.QUESTIONABLE_OVERDUE.map(pick),
    DUE_NOW: buckets.DUE_NOW.map(pick),
    COMING_SOON: buckets.COMING_SOON.map(pick),
    FUTURE: buckets.FUTURE.map(pick),
    UNKNOWN: buckets.UNKNOWN.map(pick),
  };
}

/**
 * Attempts to extract a JSON object from a text blob.
 */
function safeJsonExtract(text: string): AiAdvice | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

