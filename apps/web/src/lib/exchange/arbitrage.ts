/**
 * Arbitrage Price Scanner
 *
 * Fetches prices from multiple exchanges (Binance, Bybit, TradeSynapse)
 * for the same trading pairs, stores snapshots, and identifies
 * cross-exchange price discrepancies.
 */
import type { Sql } from "postgres";
import { getExchangeTicker, type ExchangeTicker } from "./externalApis";

export type ArbSnapshot = {
  symbol: string;
  exchange: string;
  bid: string;
  ask: string;
  ts: Date;
};

export type ArbOpportunity = {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyAsk: number;
  sellBid: number;
  spreadPct: number;
  potentialProfit: number; // per $1000
  ts: Date;
};

// ── Pairs to track ──────────────────────────────────────────────────
const TRACKED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
const EXCHANGES = ["binance", "bybit"] as const;

// ── Snapshot writer ─────────────────────────────────────────────────
export async function captureArbSnapshots(sql: Sql): Promise<ArbSnapshot[]> {
  const snapshots: ArbSnapshot[] = [];

  // Fetch all tickers in parallel (grouped by exchange)
  const promises: Promise<void>[] = [];

  for (const exchange of EXCHANGES) {
    for (const symbol of TRACKED_SYMBOLS) {
      // TST is only on TradeSynapse, skip external exchanges
      if (symbol === "TSTUSDT" && exchange !== "binance") continue;

      promises.push(
        (async () => {
          try {
            const ticker = await getExchangeTicker(exchange, symbol);
            snapshots.push({
              symbol,
              exchange,
              bid: ticker.bid,
              ask: ticker.ask,
              ts: new Date(ticker.ts),
            });
          } catch {
            // Exchange might not list this pair — skip silently
          }
        })(),
      );
    }
  }

  // Also fetch our own prices from the TradeSynapse orderbook
  promises.push(
    (async () => {
       try {
         const localPrices = await sql`
           WITH stats AS (
             SELECT 
               m.symbol,
               MAX(CASE WHEN o.side = 'buy' THEN o.price ELSE 0 END) as bid,
               MIN(CASE WHEN o.side = 'sell' THEN o.price ELSE NULL END) as ask
             FROM ex_order o
             JOIN ex_market m ON m.id = o.market_id
             WHERE o.status IN ('open', 'partially_filled')
             GROUP BY m.symbol
           )
           SELECT symbol, bid::text, ask::text FROM stats
         `;
         
         for (const p of localPrices) {
            // Only convert normalized symbols like BTC/USDT -> BTCUSDT
            const normalized = p.symbol.replace('/', '');
            
            // Only add if we have valid bid/ask (or at least one side)
            if (parseFloat(p.bid) > 0 || (p.ask !== null && parseFloat(p.ask) > 0)) {
                snapshots.push({
                    symbol: normalized,
                    exchange: 'tradesynapse',
                    bid: p.bid || "0",
                    ask: p.ask || "0", // 0 means no sellers
                    ts: new Date()
                });
            }
         }
       } catch (err) {
         console.error("Failed to fetch local prices", err);
       }
    })()
  );

  await Promise.allSettled(promises);

  // Batch insert all snapshots
  if (snapshots.length > 0) {
    await sql`
      INSERT INTO arb_price_snapshot ${sql(
        snapshots.map((s) => ({
          symbol: s.symbol,
          exchange: s.exchange,
          bid: s.bid,
          ask: s.ask,
          ts: s.ts,
        })),
      )}
    `;
  }

  return snapshots;
}

// ── Opportunity detection ───────────────────────────────────────────
export function detectOpportunities(snapshots: ArbSnapshot[]): ArbOpportunity[] {
  const opportunities: ArbOpportunity[] = [];

  // Group by symbol
  const bySymbol = new Map<string, ArbSnapshot[]>();
  for (const s of snapshots) {
    const arr = bySymbol.get(s.symbol) ?? [];
    arr.push(s);
    bySymbol.set(s.symbol, arr);
  }

  for (const [symbol, snaps] of bySymbol) {
    if (snaps.length < 2) continue;

    // For each pair of exchanges, check if buying on one and selling on another is profitable
    for (let i = 0; i < snaps.length; i++) {
      for (let j = 0; j < snaps.length; j++) {
        if (i === j) continue;
        const buyer = snaps[i]!;
        const seller = snaps[j]!;

        // Filter out same-exchange opportunities (usually data artifacts or unreachable)
        if (buyer.exchange === seller.exchange) continue;

        const buyAsk = parseFloat(buyer.ask);
        const sellBid = parseFloat(seller.bid);

        if (sellBid <= buyAsk || buyAsk <= 0) continue;

        const spreadPct = ((sellBid - buyAsk) / buyAsk) * 100;

        // Only surface opportunities with > 0.05% spread (accounts for typical fees)
        if (spreadPct < 0.05) continue;

        const potentialProfit = (spreadPct / 100) * 1000; // profit per $1000

        opportunities.push({
          symbol,
          buyExchange: buyer.exchange,
          sellExchange: seller.exchange,
          buyAsk,
          sellBid,
          spreadPct: Math.round(spreadPct * 10000) / 10000,
          potentialProfit: Math.round(potentialProfit * 100) / 100,
          ts: new Date(),
        });
      }
    }
  }

  // Sort by spread descending
  opportunities.sort((a, b) => b.spreadPct - a.spreadPct);

  return opportunities;
}

// ── Historical query ────────────────────────────────────────────────
export async function getRecentSnapshots(
  sql: Sql,
  symbol?: string,
  hoursBack = 1,
): Promise<ArbSnapshot[]> {
  const rows = symbol
    ? await sql`
        SELECT symbol, exchange, bid::text, ask::text, ts
        FROM arb_price_snapshot
        WHERE symbol = ${symbol}
          AND ts > now() - interval '1 hour' * ${hoursBack}
        ORDER BY ts DESC
        LIMIT 500
      `
    : await sql`
        SELECT symbol, exchange, bid::text, ask::text, ts
        FROM arb_price_snapshot
        WHERE ts > now() - interval '1 hour' * ${hoursBack}
        ORDER BY ts DESC
        LIMIT 500
      `;

  return rows.map((r) => ({
    symbol: r.symbol as string,
    exchange: r.exchange as string,
    bid: r.bid as string,
    ask: r.ask as string,
    ts: new Date(r.ts as string),
  }));
}

// ── Latest prices per exchange ──────────────────────────────────────
export async function getLatestPricesBySymbol(
  sql: Sql,
  symbol: string,
): Promise<ArbSnapshot[]> {
  const rows = await sql`
    SELECT DISTINCT ON (exchange) symbol, exchange, bid::text, ask::text, ts
    FROM arb_price_snapshot
    WHERE symbol = ${symbol}
      AND ts > now() - interval '5 minutes'
    ORDER BY exchange, ts DESC
  `;
  return rows.map((r) => ({
    symbol: r.symbol as string,
    exchange: r.exchange as string,
    bid: r.bid as string,
    ask: r.ask as string,
    ts: new Date(r.ts as string),
  }));
}

// ── Cleanup old snapshots (retain last 24h) ─────────────────────────
export async function cleanupOldSnapshots(sql: Sql): Promise<number> {
  const result = await sql`
    DELETE FROM arb_price_snapshot
    WHERE ts < now() - interval '24 hours'
  `;
  return result.count;
}
