// app/api/admin/data-quality/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runDataQualityCheck, autoCleanupData } from "@/lib/data-quality";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/data-quality
 * Run data quality check and return report
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    
    // Only allow admin users
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const url = new URL(req.url);
    const shopId = url.searchParams.get("shopId");
    const targetShopId = shopId ? Number(shopId) : session.shopId;

    const report = await runDataQualityCheck(targetShopId);

    return NextResponse.json({
      ok: true,
      report,
      shopId: targetShopId
    });

  } catch (error: any) {
    console.error("Data quality check error:", error);
    return NextResponse.json({ 
      error: error.message || "Data quality check failed" 
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/data-quality
 * Run data cleanup actions
 * Body: { action: 'cleanup', dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    
    // Only allow admin users
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { action, dryRun = true, shopId } = body;

    if (action !== "cleanup") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const targetShopId = shopId ? Number(shopId) : session.shopId;
    const result = await autoCleanupData(targetShopId, dryRun);

    return NextResponse.json({
      ok: true,
      result,
      dryRun,
      shopId: targetShopId
    });

  } catch (error: any) {
    console.error("Data cleanup error:", error);
    return NextResponse.json({ 
      error: error.message || "Data cleanup failed" 
    }, { status: 500 });
  }
}