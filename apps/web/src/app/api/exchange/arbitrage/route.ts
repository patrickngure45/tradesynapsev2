import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  captureArbSnapshots,
  detectOpportunities,
  getRecentSnapshots,
  getLatestPricesBySymbol,
} from "@/lib/exchange/arbitrage";

export const runtime = "nodejs";

/**
 * GET /api/exchange/arbitrage
 *
 * Query params:
 *   ?action=scan      — trigger a new scan + return opportunities
 *   ?action=latest    — get latest cached opportunities (no new scan)
 *   ?symbol=BTCUSDT   — filter by symbol
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "latest";
  const symbol = url.searchParams.get("symbol") ?? undefined;

  const sql = getSql();

  try {
    if (action === "scan") {
      // Trigger fresh scan
      const snapshots = await captureArbSnapshots(sql);
      const opportunities = detectOpportunities(snapshots);

      return NextResponse.json({
        scanned: snapshots.length,
        opportunities,
        ts: new Date().toISOString(),
      });
    }

    // Default: return latest from DB
    if (symbol) {
      const latest = await getLatestPricesBySymbol(sql, symbol);
      const opportunities = detectOpportunities(latest);
      return NextResponse.json({
        prices: latest,
        opportunities,
        ts: new Date().toISOString(),
      });
    }

    // Get all recent snapshots and compute opportunities
    const recent = await getRecentSnapshots(sql, undefined, 0.1); // last 6 min
    const opportunities = detectOpportunities(recent);

    // Group latest prices by symbol + exchange
    const priceMap: Record<string, Record<string, { bid: string; ask: string; ts: string }>> = {};
    for (const s of recent) {
      if (!priceMap[s.symbol]) priceMap[s.symbol] = {};
      if (!priceMap[s.symbol]![s.exchange]) {
        priceMap[s.symbol]![s.exchange] = {
          bid: s.bid,
          ask: s.ask,
          ts: s.ts.toISOString(),
        };
      }
    }

    return NextResponse.json({
      prices: priceMap,
      opportunities,
      symbols: Object.keys(priceMap),
      ts: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("[arb] Error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: "Failed to fetch arbitrage data" },
      { status: 500 },
    );
  }
}
