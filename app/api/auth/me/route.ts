// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getSession();

  if (!sess) {
    // Not signed in; return 200 with a clear flag (keeps client logic simple)
    return NextResponse.json({ ok: true, authenticated: false });
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: {
      email: sess.email,
      role: sess.role,
      shopId: sess.shopId,
    },
  });
}
