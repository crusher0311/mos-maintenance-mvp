// src/app/api/carfax/fetch/[vin]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";
import fetchCarfaxByVin from "../../../../../lib/carfaxClient";
import { upsertOdometers, upsertServiceEvents } from "../../../../../lib/saveIngest";

function pickShopIdFrom(session, url) {
  const q = new URL(url).searchParams;
  const fromQuery = q.get("shopId");
  if (fromQuery) return fromQuery;
  const arr = session?.user?.shopIds || [];
  return arr.length ? String(arr[0]) : null;
}

export async function POST(req, ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ✅ Next 15: params is async
  const { vin: rawVin } = await ctx.params;
  const vin = rawVin?.trim();
  if (!vin) {
    return NextResponse.json({ error: "VIN missing" }, { status: 400 });
  }

  const shopId = pickShopIdFrom(session, req.url);
  if (!shopId) {
    return NextResponse.json({ error: "shopId missing (query ?shopId=... or attach one to your user)" }, { status: 400 });
  }

  const result = await fetchCarfaxByVin(vin);
  if (!result?.ok) {
    return NextResponse.json({ error: result?.error || "Carfax fetch failed" }, { status: 502 });
  }

  const { odometerPoints = [], serviceEvents = [] } = result.normalized || {};

  const odoRes = await upsertOdometers(shopId, vin, odometerPoints);
  const svcRes = await upsertServiceEvents(shopId, vin, serviceEvents);

  return NextResponse.json({
    ok: true,
    vin,
    shopId,
    source: result.source || "unknown",
    counts: {
      odometer: odoRes,
      serviceEvents: svcRes,
    },
  });
}

export async function GET(req, ctx) {
  return POST(req, ctx);
}
