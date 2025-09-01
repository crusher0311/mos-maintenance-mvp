import { getDb } from "@/lib/mongo";

export type RateResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  bucketKey: string;
};

/**
 * Mongo rate limiter using time-bucket documents.
 * - Keyed by a stable id (e.g., route + IP + emailLower).
 * - One document per window bucket, TTL-managed by an index.
 */
export async function rateLimit(opts: {
  id: string;          // e.g. "login:1.2.3.4:email@x.com:shop7"
  limit: number;       // max requests per window
  windowSeconds: number;
}): Promise<RateResult> {
  const { id, limit, windowSeconds } = opts;
  const db = await getDb();
  const col = db.collection("ratelimits");

  const nowMs = Date.now();
  const bucket = Math.floor(nowMs / (windowSeconds * 1000));
  const bucketKey = `${id}:${bucket}`;
  const resetAt = new Date((bucket + 1) * windowSeconds * 1000);
  const expiresAt = new Date(resetAt.getTime() + 5000); // small buffer so doc disappears after window

  // Atomically increment the count for this bucket
  const result = await col.findOneAndUpdate(
    { bucketKey },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        bucketKey,
        count: 0,            // becomes 1 after $inc on insert
        windowSeconds,
        createdAt: new Date(),
        expiresAt,
      },
    },
    { upsert: true, returnDocument: "after" as const }
  );

  const doc: any = (result as any)?.value ?? (result as any);
  const count = typeof doc?.count === "number" ? doc.count : 1;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    limit,
    resetAt,
    bucketKey,
  };
}

export function clientIp(req: Request): string {
  // On Vercel/Node, use X-Forwarded-For; take the first IP
  const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return xff || "unknown";
}
