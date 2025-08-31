import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  return NextResponse.json({
    ok: true,
    email: s.user.email,
    role: s.user.role,
    shopId: s.shopId,
  });
}
