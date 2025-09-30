// lib/ai.ts
export async function runResponse(model: string, input: string): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
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
