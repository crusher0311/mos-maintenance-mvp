// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/mongo";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await safeJson(req);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const shopIdRaw = body?.shopId;
    const shopIdNum = Number(shopIdRaw);
    const hasShopId = Number.isFinite(shopIdNum);

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const users = db.collection("users");
    const sessions = db.collection("sessions");

    // Find user (optionally scoped by shop)
    let user: any = null;
    if (hasShopId) {
      user = await users.findOne({ emailLower: email, shopId: shopIdNum });
      if (!user) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }
    } else {
      // No shopId provided — ensure email is unique across shops
      const found = await users.find({ emailLower: email }).limit(2).toArray();
      if (found.length === 0) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }
      if (found.length > 1) {
        return NextResponse.json(
          {
            error:
              "Multiple accounts found for this email. Please provide your Shop ID.",
          },
          { status: 409 }
        );
      }
      user = found[0];
    }

    // Verify password (format: "scrypt:1:<salt>:<hash>")
    if (!user?.passwordHash || !user.passwordHash.startsWith("scrypt:1:")) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }
    const ok = await verifyScrypt(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Create session
    const now = new Date();
    const token = crypto.randomBytes(24).toString("hex"); // 48-char token
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await sessions.insertOne({
      token,
      userId: user._id,
      shopId: user.shopId,
      createdAt: now,
      expiresAt,
    });

    const res = NextResponse.json({
      ok: true,
      redirect: "/dashboard",
      shopId: user.shopId,
      role: user.role,
    });

    // IMPORTANT: cookie name matches lib/auth.ts
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

async function safeJson(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function verifyScrypt(password: string, stored: string): Promise<boolean> {
  // "scrypt:1:<salt>:<hexHash>"
  const [, , salt, hexHash] = stored.split(":");
  if (!salt || !hexHash) return false;

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, buf) =>
      err ? reject(err) : resolve(buf)
    );
  });

  const a = Buffer.from(hexHash, "hex");
  const b = derived;
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
