import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sess = await getSession(req);

  if (!sess) {
    // Not signed in; return 200 with a clear flag (keeps client logic simple)
    return NextResponse.json({ ok: true, authenticated: false });
  }

  const { user } = sess;
  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: {
      _id: user._id,
      email: user.email,
      role: user.role,
      shopId: user.shopId,
    },
  });
}
