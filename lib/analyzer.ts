export type AnalyzeInput = { vin: string; miles?: number | null };
export type AnalyzeResult = { summary: string; items: Array<{ title: string; details?: string }> };

export async function analyzeVin(_input: AnalyzeInput): Promise<AnalyzeResult> {
  return { summary: "Analyzer stub (not enabled in this build).", items: [] };
}
