// app/api/oe/fetch/[vin]/route.ts
import { NextResponse } from "next/server";
import { connectToMongo } from "../../../../lib/db/mongoose";
import { VehicleSchedule } from "../../../../lib/models/VehicleSchedule";

const DEFAULT_TTL_DAYS = 30;

function daysAgo(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - days);
  return copy;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ vin: string }> } // Next.js 15: params is async
) {
  const { vin: rawVin } = await ctx.params;
  const vin = (rawVin || "").trim().toUpperCase();

  if (!vin || vin.length !== 17) {
    return NextResponse.json({ error: "VIN must be 17 characters." }, { status: 400 });
  }

  const url = new URL(_req.url);
  const refresh = ["1", "true", "yes"].includes((url.searchParams.get("refresh") || "").toLowerCase());
  const ttlDays = Number(url.searchParams.get("ttlDays") || DEFAULT_TTL_DAYS) || DEFAULT_TTL_DAYS;

  try {
    await connectToMongo();

    // try cache first (unless refresh)
    if (!refresh) {
      const cached = await VehicleSchedule.findOne({ vin }).lean();
      if (cached && cached.fetchedAt && cached.fetchedAt > daysAgo(new Date(), ttlDays)) {
        return NextResponse.json(
          {
            vin,
            source: "cache",
            status: cached.status,
            raw: cached.raw,
            fetchedAt: cached.fetchedAt,
          },
          { status: 200 }
        );
      }
    }

    // upstream call
    const apiKey = process.env.VEHICLE_DATABASES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server missing VEHICLE_DATABASES_API_KEY" },
        { status: 500 }
      );
    }

    const upstreamUrl = `https://api.vehicledatabases.com/vehicle-maintenance/v3/${vin}`;
    const res = await fetch(upstreamUrl, {
      headers: { "x-AuthKey": apiKey },
      cache: "no-store",
    });

    const text = await res.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { body = text; }

    // upsert cache (store whatever we got, even non-200, so we can see the error later)
    const doc = await VehicleSchedule.findOneAndUpdate(
      { vin },
      {
        vin,
        provider: "vehicle-databases",
        status: res.status,
        raw: body,
        fetchedAt: new Date(),
      },
      { upsert: true, new: true }
    ).lean();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "OE maintenance fetch failed",
          status: res.status,
          body,
          source: refresh ? "upstream" : "attempted-upstream",
        },
        { status: res.status }
      );
    }

    // success
    return NextResponse.json(
      {
        vin,
        source: "upstream",
        status: res.status,
        raw: body,
        fetchedAt: doc?.fetchedAt ?? new Date(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Network/DB error", details: String(err) },
      { status: 500 }
    );
  }
}
