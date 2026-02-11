import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { captureFundingSignals, getLatestFundingSignals } from "@/lib/exchange/funding";

export const runtime = "nodejs";

/**
 * GET /api/exchange/funding
 * 
 * ?action=scan   -> Fetch fresh rates from CEXs (Slow)
 * ?action=latest -> Get cached opportunities from DB (Fast)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "latest";
  const sql = getSql();

  try {
    if (action === "scan") {
      const result = await captureFundingSignals(sql);
      return NextResponse.json({
         success: true,
         scanned: result.signalsCount,
         errors: result.errors,
         ts: new Date()
      });
    }

    const cached = await getLatestFundingSignals(sql);
    return NextResponse.json({
       signals: cached,
       ts: new Date()
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
