/**
 * Arbitrage Price Scanner
 *
 * Fetches prices from multiple exchanges (Binance, Bybit, TradeSynapse)
 * for the same trading pairs, stores snapshots, and identifies
 * cross-exchange price discrepancies.
 */
import type { Sql } from "postgres";
import { getExchangeTicker, type SupportedExchange } from "./externalApis";

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
  // Gross spread (price-only). Does not include fees/slippage/transfer.
  spreadPct: number;
  // Gross profit per $1000 (price-only).
  potentialProfit: number;

  // Net metrics (estimated). These are what users should consider actionable.
  netSpreadPct: number;
  netProfit: number; // per $1000
  ts: Date;
};

export type ArbScanError = {
  exchange: string;
  symbol: string;
  message: string;
};

export type ArbScanResult = {
  snapshots: ArbSnapshot[];
  errors: ArbScanError[];
};

export type ArbCaptureOptions = {
  exchanges?: SupportedExchange[];
  symbols?: string[];
  includeInternalPrices?: boolean;
  storeSnapshots?: boolean;
};

// ── Pairs / exchanges to track ─────────────────────────────────────
// Default to liquid USDT pairs. Keep the list short to reduce API load and
// to avoid surfacing spreads that cannot be executed due to thin books.
const DEFAULT_TRACKED_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "TRXUSDT",
  "LINKUSDT",
  "AVAXUSDT",
  "TONUSDT",
  "MATICUSDT",
];

const SUPPORTED_EXCHANGES: SupportedExchange[] = [
  "binance",
  "bybit",
  "okx",
  "kucoin",
  "gateio",
  "bitget",
  "mexc",
];

function parseSupportedExchanges(name: string, fallback: SupportedExchange[]): SupportedExchange[] {
  const raw = process.env[name];
  if (!raw) return fallback;

  const allow = new Set(SUPPORTED_EXCHANGES);
  const parts = raw
    .split(/[\n,]/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((s) => allow.has(s as SupportedExchange)) as SupportedExchange[];

  // de-dupe while preserving order
  const out: SupportedExchange[] = [];
  const seen = new Set<SupportedExchange>();
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }

  return out.length ? out : fallback;
}

function parseCsvEnvLower(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parts = raw
    .split(/[\n,]/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? parts : fallback;
}

function parseSymbolsEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;

  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,]/g)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Accept "BTCUSDT" or "BTC/USDT" and normalize.
    const normalized = trimmed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!/^[A-Z0-9]{6,30}$/.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out.length ? out : fallback;
}

const TRACKED_SYMBOLS = parseSymbolsEnv("ARB_SYMBOLS", DEFAULT_TRACKED_SYMBOLS);

// By default, scan all supported exchanges so users get wide coverage.
// Use ARB_EXCHANGES to narrow the scan surface if needed.
const EXCHANGES = parseSupportedExchanges("ARB_EXCHANGES", SUPPORTED_EXCHANGES);

// Only generate "opportunities" between these exchanges.
// This keeps the UI honest if ARB_EXCHANGES includes scanner-only venues.
// Default to Binance/Bybit as "actionable" unless overridden.
const OPP_EXCHANGES = new Set(parseCsvEnvLower("ARB_OPP_EXCHANGES", ["binance", "bybit"]));

const INCLUDE_INTERNAL_OPPS = process.env.ARB_INCLUDE_INTERNAL === "1";

export function getArbScannerConfig(): {
  exchanges: SupportedExchange[];
  oppExchanges: string[];
  includeInternal: boolean;
  symbols: string[];
} {
  return {
    exchanges: [...EXCHANGES],
    oppExchanges: Array.from(OPP_EXCHANGES),
    includeInternal: INCLUDE_INTERNAL_OPPS,
    symbols: [...TRACKED_SYMBOLS],
  };
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const v = raw ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

function bpsToPct(bps: number): number {
  return bps / 100; // 100 bps = 1%
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const concurrency = Math.max(1, Math.floor(limit));
  let i = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      await worker(items[idx]!);
    }
  });

  await Promise.allSettled(runners);
}

// ── Snapshot writer ─────────────────────────────────────────────────
export async function captureArbSnapshots(sql: Sql, opts?: ArbCaptureOptions): Promise<ArbScanResult> {
  const snapshots: ArbSnapshot[] = [];
  const errors: ArbScanError[] = [];

  const exchanges = ((opts && "exchanges" in opts ? opts.exchanges : undefined) ?? EXCHANGES) as SupportedExchange[];
  const symbolsAll = (opts && "symbols" in opts ? opts.symbols : undefined) ?? TRACKED_SYMBOLS;
  const includeInternalPrices = opts?.includeInternalPrices ?? true;
  const storeSnapshots = opts?.storeSnapshots ?? true;

  // Fetch all tickers in parallel (grouped by exchange)
  const promises: Promise<void>[] = [];

  for (const exchange of exchanges) {
    const symbols = symbolsAll;

    const defaultConcurrency = Math.max(1, Math.floor(numEnv("ARB_CONCURRENCY", 4)));
    const bybitConcurrency = Math.max(1, Math.floor(numEnv("ARB_BYBIT_CONCURRENCY", 6)));
    const limit = exchange === "bybit" ? Math.min(bybitConcurrency, symbols.length) : Math.min(defaultConcurrency, symbols.length);

    promises.push(
      (async () => {
        await runWithConcurrency(symbols, limit, async (symbol) => {
          try {
            const ticker = await getExchangeTicker(exchange, symbol);
            const bidN = Number.parseFloat(ticker.bid);
            const askN = Number.parseFloat(ticker.ask);
            if (!Number.isFinite(bidN) || !Number.isFinite(askN) || bidN <= 0 || askN <= 0) return;
            snapshots.push({
              symbol,
              exchange,
              bid: ticker.bid,
              ask: ticker.ask,
              ts: new Date(),
            });
          } catch (err) {
            errors.push({
              exchange,
              symbol,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        });
      })(),
    );

  }

  // Also fetch our own prices from the TradeSynapse orderbook (best-effort)
  if (includeInternalPrices) {
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
            const normalized = String(p.symbol).replace('/', '');

            const bid = Number.parseFloat(p.bid ?? "0");
            const ask = Number.parseFloat((p.ask as unknown as string) ?? "0");
            // Only add if we have a real two-sided book.
            if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) continue;

            snapshots.push({
              symbol: normalized,
              exchange: "tradesynapse",
              bid: String(bid),
              ask: String(ask),
              ts: new Date(),
            });
          }
        } catch (err) {
          console.error("Failed to fetch local prices", err);
        }
      })(),
    );
  }

  await Promise.allSettled(promises);

  // Batch insert all snapshots
  if (storeSnapshots && snapshots.length > 0) {
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

  return { snapshots, errors };
}

// ── Opportunity detection ───────────────────────────────────────────
export function detectOpportunities(
  snapshots: ArbSnapshot[], 
  options: {
    minNetSpread?: number;
    oppExchanges?: string[];
    includeInternal?: boolean;
    quoteSuffix?: string;
  } = {}
): ArbOpportunity[] {
  const opportunities: ArbOpportunity[] = [];

  // Exchanges like Binance/Bybit are very efficient; spreads are often tiny.
  // Keep a configurable floor to avoid zero/noise results.
  const minSpreadPct = (() => {
    const raw = process.env.ARB_MIN_SPREAD_PCT;
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) ? v : 0.001; // 0.001% default
  })();

  // Cost model (estimates): two taker fees + two legs of slippage, plus optional
  // transfer/settlement overhead (set to 0 if you keep inventory on both venues).
  const takerFeeBpsPerLeg = Math.max(0, numEnv("ARB_TAKER_FEE_BPS", 10));
  const slippageBpsPerLeg = Math.max(0, numEnv("ARB_SLIPPAGE_BPS", 2));
  const transferBps = Math.max(0, numEnv("ARB_TRANSFER_BPS", 0));
  const latencyBps = Math.max(0, numEnv("ARB_LATENCY_BPS", 2));

  const costPct = bpsToPct(takerFeeBpsPerLeg * 2 + slippageBpsPerLeg * 2 + transferBps + latencyBps);
  
  // Use provided option or env var (default to 0 for strict profitability)
  // If user wants to see "near misses", we can pass a negative number.
  const minNetSpreadPct = options.minNetSpread ?? Math.max(0, numEnv("ARB_MIN_NET_SPREAD_PCT", 0));

  const includeInternal = options.includeInternal ?? INCLUDE_INTERNAL_OPPS;
  const oppSet = (() => {
    if (Array.isArray(options.oppExchanges) && options.oppExchanges.length) {
      return new Set(options.oppExchanges.map((s) => String(s).toLowerCase()));
    }
    return new Set(Array.from(OPP_EXCHANGES));
  })();

  const quoteSuffix = (options.quoteSuffix ?? "USDT").toUpperCase();

  // Group by symbol
  const bySymbol = new Map<string, ArbSnapshot[]>();
  for (const s of snapshots) {
    const arr = bySymbol.get(s.symbol) ?? [];
    arr.push(s);
    bySymbol.set(s.symbol, arr);
  }

  for (const [symbol, snaps] of bySymbol) {
    if (snaps.length < 2) continue;

    // Keep the arbitrage page focused on liquid USDT pairs.
    if (!symbol.toUpperCase().endsWith(quoteSuffix)) continue;

    // Restrict to "opportunity exchanges" by default.
    const filtered = snaps.filter((s) => {
      const ex = String(s.exchange).toLowerCase();
      if (ex === "tradesynapse") return includeInternal;
      return oppSet.has(ex);
    });
    if (filtered.length < 2) continue;

    // For each pair of exchanges, check if buying on one and selling on another is profitable
    for (let i = 0; i < filtered.length; i++) {
      for (let j = 0; j < filtered.length; j++) {
        if (i === j) continue;
        const buyer = filtered[i]!;
        const seller = filtered[j]!;

        // Filter out same-exchange opportunities (usually data artifacts or unreachable)
        if (buyer.exchange === seller.exchange) continue;

        const buyAsk = parseFloat(buyer.ask);
        const sellBid = parseFloat(seller.bid);

        if (sellBid <= buyAsk || buyAsk <= 0) continue;

        const spreadPct = ((sellBid - buyAsk) / buyAsk) * 100;

        const netSpreadPct = spreadPct - costPct;

        // Basic noise filter
        if (spreadPct < minSpreadPct) continue;

        // Only surface opportunities that are net-profitable under our cost model.
        if (!Number.isFinite(netSpreadPct) || netSpreadPct < minNetSpreadPct) continue;

        const potentialProfit = (spreadPct / 100) * 1000; // gross profit per $1000
        const netProfit = (netSpreadPct / 100) * 1000; // net profit per $1000

        opportunities.push({
          symbol,
          buyExchange: buyer.exchange,
          sellExchange: seller.exchange,
          buyAsk,
          sellBid,
          spreadPct: Math.round(spreadPct * 10000) / 10000,
          potentialProfit: Math.round(potentialProfit * 100) / 100,
          netSpreadPct: Math.round(netSpreadPct * 10000) / 10000,
          netProfit: Math.round(netProfit * 100) / 100,
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
