import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  apiKey?: string;
  apiPassword?: string;
  apiBase?: string;
};

// Small helper to avoid leaking secrets
function mask(s?: string, keep = 4) {
  if (!s) return "";
  if (s.length <= keep) return "*".repeat(s.length);
  return `${"*".repeat(Math.max(0, s.length - keep))}${s.slice(-keep)}`;
}

/**
 * Save/Update AutoFlow credentials for a shop.
 * PUT /api/shops/[shopId]/credentials
 * Body: { apiKey: string, apiPassword: string, apiBase?: string }
 */
export async function PUT(req: NextRequest, ctx: { params: { shopId: string } }) {
  try {
    const shopId = ctx.params?.shopId?.trim();
    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId in path" }, { status: 400 });
    }

    const body = (await req.json()) as Body;
    const { apiKey, apiPassword, apiBase } = body || {};

    if (!apiKey || !apiPassword) {
      return NextResponse.json(
        { error: "apiKey and apiPassword are required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const shops = db.collection("shops");

    // Ensure the shop exists first
    const shop = await shops.findOne({ shopId });
    if (!shop) {
      return NextResponse.json(
        { error: `Shop ${shopId} not found` },
        { status: 404 }
      );
    }

    // Store creds under a namespaced field
    const update = {
      $set: {
        "credentials.autoflow": {
          apiKey,
          apiPassword,
          ...(apiBase ? { apiBase } : {}),
        },
        updatedAt: new Date(),
      },
    };

    await shops.updateOne({ shopId }, update);

    return NextResponse.json({
      ok: true,
      shopId,
      saved: true,
      // return only SAFE info
      credentials: {
        provider: "autoflow",
        apiKey: mask(apiKey),
        apiPassword: mask(apiPassword),
        apiBase: apiBase || null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Optional: Fetch (masked) credential status for the shop.
 * GET /api/shops/[shopId]/credentials
 */
export async function GET(_req: NextRequest, ctx: { params: { shopId: string } }) {
  try {
    const shopId = ctx.params?.shopId?.trim();
    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId in path" }, { status: 400 });
    }

    const db = await getDb();
    const shops = db.collection("shops");
    const shop = await shops.findOne(
      { shopId },
      { projection: { "credentials.autoflow": 1, shopId: 1 } }
    );

    if (!shop) {
      return NextResponse.json({ error: `Shop ${shopId} not found` }, { status: 404 });
    }

    const c = shop.credentials?.autoflow;
    const hasCreds = Boolean(c?.apiKey && c?.apiPassword);

    return NextResponse.json({
      ok: true,
      shopId,
      hasCreds,
      credentials: hasCreds
        ? {
            provider: "autoflow",
            apiKey: mask(c.apiKey),
            apiPassword: mask(c.apiPassword),
            apiBase: c.apiBase ?? null,
          }
        : null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
