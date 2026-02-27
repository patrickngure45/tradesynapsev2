import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  type ArbSnapshot,
  captureArbSnapshots,
  detectOpportunities,
  getArbScannerConfig,
  getRecentSnapshots,
  getLatestPricesBySymbol,
} from "@/lib/exchange/arbitrage";

export const runtime = "nodejs";

function latestPerSymbolExchange(snapshots: ArbSnapshot[]): ArbSnapshot[] {
  const byKey = new Map<string, ArbSnapshot>();
  for (const s of snapshots) {
    const key = `${s.symbol}::${s.exchange}`;
    const prev = byKey.get(key);
    if (!prev || s.ts > prev.ts) byKey.set(key, s);
  }
  return Array.from(byKey.values());
}

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
  const debug = url.searchParams.get("debug") === "1";

  const scanner = getArbScannerConfig();

  const sql = getSql();

  try {
    if (action === "scan") {
      // Trigger fresh scan
      const scan = await captureArbSnapshots(sql);
      const snapshots = scan.snapshots;
      // Allow slightly negative net spreads (-1%) to show "near misses" in the UI
      const opportunities = detectOpportunities(snapshots, { minNetSpread: -1.0 });

      const minSpreadPctUsed = (() => {
        const raw = process.env.ARB_MIN_SPREAD_PCT;
        const v = raw ? Number(raw) : NaN;
        return Number.isFinite(v) ? v : 0.001;
      })();

      // Group latest prices by symbol + exchange
      const priceMap: Record<string, Record<string, { bid: string; ask: string; ts: string }>> = {};
      for (const s of snapshots) {
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
        scanned: snapshots.length,
        scannedExchanges: scanner.exchanges,
        oppExchanges: scanner.oppExchanges,
        includeInternal: scanner.includeInternal,
        trackedSymbols: scanner.symbols,
        opportunities,
        minSpreadPctUsed,
        prices: priceMap,
        snapshots: debug ? snapshots : undefined,
        errors: debug ? scan.errors : undefined,
        ts: new Date().toISOString(),
      });
    }

    // Default: return latest from DB
    if (symbol) {
      const latest = await getLatestPricesBySymbol(sql, symbol);
      const opportunities = detectOpportunities(latest, { minNetSpread: -1.0 });
      return NextResponse.json({
        prices: latest,
        scannedExchanges: scanner.exchanges,
        oppExchanges: scanner.oppExchanges,
        includeInternal: scanner.includeInternal,
        trackedSymbols: scanner.symbols,
        opportunities,
        ts: new Date().toISOString(),
      });
    }

    // Get all recent snapshots and compute opportunities
    const recent = await getRecentSnapshots(sql, undefined, 0.1); // last 6 min
    const latest = latestPerSymbolExchange(recent);
    const opportunities = detectOpportunities(latest, { minNetSpread: -1.0 });

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
      scannedExchanges: scanner.exchanges,
      oppExchanges: scanner.oppExchanges,
      includeInternal: scanner.includeInternal,
      trackedSymbols: scanner.symbols,
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
