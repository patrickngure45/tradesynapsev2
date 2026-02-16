import { NextRequest, NextResponse } from "next/server";
import { analyzeMarketRegime } from "@/lib/intelligence/marketRegime";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? "BTC/USDT";
  const exchange = url.searchParams.get("exchange") ?? "binance";

  try {
    const report = await analyzeMarketRegime(exchange, symbol);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[regime] Error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
