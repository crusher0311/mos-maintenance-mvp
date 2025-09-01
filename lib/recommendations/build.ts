export async function buildRecommendations(_args: { shopId: number; vin: string; customerExternalId: string }) {
  // TODO: Read dvi/oem/carfax docs, call OpenAI, store compiled plan in db.recommendations
  return { ok: true, recommendationDocId: null };
}
