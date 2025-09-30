// app/api/debug/session/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireSession();
  return NextResponse.json({ session: s });
}
