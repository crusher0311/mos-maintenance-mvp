import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // avoid caching

// Shape expected by analyzer:
// services: [{ category, name, schedule?: { name }, intervals: [{ miles?, months?, type: "every"|"at" }], trans_notes? }]

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> }
) {
  const { vin: vinRaw } = await params;                 // ✅ await params
  const vin = (vinRaw || "").toUpperCase().trim();

  const url = new URL(req.url);
  const schedule = (url.searchParams.get("schedule") || "normal").toLowerCase();

  // --- TEMP MOCK DATA for testing ---
  const mock = {
    vin,
    year: 2011,
    make: "Ford",
    model: "F-350",
    services: [
      {
        category: "Engine",
        name: "Engine Oil & Filter",
        schedule: { name: "Every" },
        intervals: [{ miles: 7500, months: 6, type: "every" as const }],
        trans_notes: null,
      },
      {
        category: "Tires",
        name: "Rotate Tires",
        schedule: { name: "Every" },
        intervals: [{ miles: 7500, months: 6, type: "every" as const }],
        trans_notes: null,
      },
      {
        category: "Fuel",
        name: "Replace Fuel Filter (Diesel)",
        schedule: { name: "Every" },
        intervals: [{ miles: 15000, months: 12, type: "every" as const }],
        trans_notes: null,
      },
      {
        category: "Cooling",
        name: "Inspect Coolant Level & Hoses",
        schedule: { name: "Every" },
        intervals: [{ miles: 7500, months: 6, type: "every" as const }],
        trans_notes: null,
      },
      {
        category: "Air",
        name: "Replace Engine Air Filter",
        schedule: { name: "At" },
        intervals: [{ miles: 30000, months: 24, type: "at" as const }],
        trans_notes: null,
      },
      {
        category: "Transmission",
        name: "Automatic Transmission Service",
        schedule: { name: "At" },
        intervals: [{ miles: 60000, months: 48, type: "at" as const }],
        trans_notes: "Only applicable for automatic transmissions.",
      },
      {
        category: "Brakes",
        name: "Brake Fluid Replace",
        schedule: { name: "At" },
        intervals: [{ months: 36, type: "at" as const }],
        trans_notes: null,
      },
    ],
  };

  // Slightly tighter intervals for severe schedule (optional)
  if (schedule === "severe") {
    mock.services = mock.services.map((s) => {
      const intervals = s.intervals.map((i) => {
        const out: any = { ...i };
        if (typeof out.miles === "number") out.miles = Math.max(1000, Math.round(out.miles * 0.75));
        if (typeof out.months === "number") out.months = Math.max(1, Math.round(out.months * 0.75));
        return out;
      });
      return { ...s, intervals };
    });
  }

  return NextResponse.json(mock, { status: 200 });
}
