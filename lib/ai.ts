// lib/ai.ts

// Available OpenAI models
export const MODELS = [
  "gpt-4",
  "gpt-4-turbo", 
  "gpt-3.5-turbo",
] as const;

export const DEFAULT_MODEL = "gpt-3.5-turbo";

// OpenAI client wrapper
export function getOpenAI() {
  // Safe access to environment variable
  let apiKey: string | undefined;
  try {
    apiKey = typeof window === 'undefined' ? (globalThis as any).process?.env?.OPENAI_API_KEY : undefined;
  } catch {
    apiKey = undefined;
  }
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  return {
    apiKey,
    async chat(messages: any[], model = DEFAULT_MODEL) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 1000,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }
      
      return response.json();
    }
  };
}

export async function runResponse(model: string, input: string): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
}> {
  // Safe access to environment variable
  let apiKey: string | undefined;
  try {
    apiKey = typeof window === 'undefined' ? (globalThis as any).process?.env?.OPENAI_API_KEY : undefined;
  } catch {
    apiKey = undefined;
  }
  
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY is not set" };

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input }),
    });

    if (!resp.ok) {
      const err = await safeText(resp);
      return { ok: false, error: `OpenAI ${resp.status}: ${err}` };
    }

    const data: any = await resp.json();
    const text = data?.output_text ?? extractTextFromResponse(data);
    return { ok: true, text: typeof text === "string" ? text : JSON.stringify(data) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "OpenAI request failed" };
  }
}

function extractTextFromResponse(data: any): string {
  const parts =
    data?.output?.[0]?.content ??
    data?.choices?.[0]?.message?.content ??
    [];
  if (Array.isArray(parts)) {
    return parts
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
  }
  return "";
}

async function safeText(resp: Response) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}
