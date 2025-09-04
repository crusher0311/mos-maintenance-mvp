import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    CARFAX_POST_URL: process.env.CARFAX_POST_URL || null,
    CARFAX_PDI: process.env.CARFAX_PDI || null,
  });
}
