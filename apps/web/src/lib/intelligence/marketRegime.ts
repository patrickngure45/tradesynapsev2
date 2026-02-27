// Market Regime Classification Engine
// Analyzes market volatility, trend, and liquidity to classify the current state.

import { createCcxtPublic } from "@/lib/exchange/externalApis";
import { getExchangeFundingRates } from "@/lib/exchange/externalApis";
import { getSql } from "@/lib/db";

export type Regime = "TRENDING_UP" | "TRENDING_DOWN" | "RANGING_QUIET" | "RANGING_VOLATILE" | "CRASH_RISK";

export type StrategyRecommendation = 
  | "GRID_LONG"    // Buy dips in range
  | "GRID_NEUTRAL" // Oscillate
  | "TREND_FOLLOW" // Don't fight the trend
  | "CASH_CARRY"   // Neutral Arbitrage
  | "STAY_FLAT";   // Too risky

export type RegimeReport = {
  symbol: string;
  regime: Regime;
  recommendation: StrategyRecommendation;
  metrics: {
    fundingRate: number;
    volatilityScore: number; // 0-100
    spreadBps: number;
    volume24h: number;
  };
  reason: string;
};

// Calculate Standard Deviation for Volatility
function calcStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// CCXT's fetchOHLCV is not exposed in our externalApis.ts yet, so we'll extend it locally here or rely on Ticker/Funding for now.
// For a robust "Signal Engine", we need historical candles. 
// I will create a helper to fetch OHLCV via CCXT directly here for analysis.

import ccxt from "ccxt";

type Candle = [number, number, number, number, number, number];

async function fetchOHLCV(exchangeId: string, symbol: string, timeframe = "1h", limit = 24): Promise<number[][]> {
  const ex = new (ccxt as any)[exchangeId]();
  // Ensure unified symbol format
  // CCXT expects "BTC/USDT" usually
  const ccxtSymbol = symbol.includes('/') ? symbol : symbol.replace("USDT", "/USDT");
  
  if (typeof ex.fetchOHLCV !== "function") return [];
  
  // OHLCV structure: [ timestamp, open, high, low, close, volume ]
  try {
      const candles: number[][] = await ex.fetchOHLCV(ccxtSymbol, timeframe, undefined, limit);
      return candles;
  } catch (e) {
      console.warn(`Failed to fetch candles for ${symbol}:`, e);
      return [];
  }
}

async function fetchInternalOHLCV(symbol: string, timeframe = "1h", limit = 48): Promise<Candle[]> {
  if (timeframe !== "1h") return [];
  const sql = getSql();
  const sym = symbol.trim();
  if (!sym) return [];

  // Find enabled market by symbol (e.g. BTC/USDT).
  const marketRows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM ex_market
    WHERE upper(symbol) = upper(${sym})
      AND status = 'enabled'
    LIMIT 1
  `;
  const marketId = marketRows[0]?.id;
  if (!marketId) return [];

  // Build 1h OHLCV from executions.
  // Output is: [ts, open, high, low, close, volume]
  const rows = await sql<
    {
      ts: string;
      open: string | null;
      high: string | null;
      low: string | null;
      close: string | null;
      volume: string | null;
    }[]
  >`
    WITH buckets AS (
      SELECT
        date_trunc('hour', created_at) AS ts,
        (array_agg(price ORDER BY created_at ASC, id ASC))[1] AS open,
        (array_agg(price ORDER BY created_at DESC, id DESC))[1] AS close,
        MAX(price) AS high,
        MIN(price) AS low,
        SUM(quantity) AS volume
      FROM ex_execution
      WHERE market_id = ${marketId}::uuid
        AND created_at >= NOW() - (${limit}::int || ' hours')::interval
      GROUP BY 1
    )
    SELECT
      ts::text,
      open::text,
      high::text,
      low::text,
      close::text,
      volume::text
    FROM buckets
    ORDER BY ts ASC
  `;

  const out: Candle[] = [];
  for (const r of rows) {
    const tsMs = Date.parse(r.ts);
    const open = r.open ? Number(r.open) : NaN;
    const high = r.high ? Number(r.high) : NaN;
    const low = r.low ? Number(r.low) : NaN;
    const close = r.close ? Number(r.close) : NaN;
    const vol = r.volume ? Number(r.volume) : 0;
    if (!Number.isFinite(tsMs)) continue;
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    out.push([tsMs, open, high, low, close, Number.isFinite(vol) ? vol : 0]);
  }

  return out;
}

async function fetchInternalTopOfBook(symbol: string): Promise<{ bid: number | null; ask: number | null } | null> {
  const sql = getSql();
  const sym = symbol.trim();
  if (!sym) return null;

  const marketRows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM ex_market
    WHERE upper(symbol) = upper(${sym})
      AND status = 'enabled'
    LIMIT 1
  `;
  const marketId = marketRows[0]?.id;
  if (!marketId) return null;

  const [bidRow] = await sql<{ price: string }[]>`
    SELECT price::text AS price
    FROM ex_order
    WHERE market_id = ${marketId}::uuid
      AND side = 'buy'
      AND status IN ('open','partially_filled')
    ORDER BY price DESC, created_at ASC
    LIMIT 1
  `;
  const [askRow] = await sql<{ price: string }[]>`
    SELECT price::text AS price
    FROM ex_order
    WHERE market_id = ${marketId}::uuid
      AND side = 'sell'
      AND status IN ('open','partially_filled')
    ORDER BY price ASC, created_at ASC
    LIMIT 1
  `;

  const bid = bidRow?.price ? Number(bidRow.price) : null;
  const ask = askRow?.price ? Number(askRow.price) : null;
  return {
    bid: bid != null && Number.isFinite(bid) && bid > 0 ? bid : null,
    ask: ask != null && Number.isFinite(ask) && ask > 0 ? ask : null,
  };
}

async function fetchInternalVolume24h(symbol: string): Promise<number> {
  const sql = getSql();
  const sym = symbol.trim();
  if (!sym) return 0;

  const marketRows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM ex_market
    WHERE upper(symbol) = upper(${sym})
      AND status = 'enabled'
    LIMIT 1
  `;
  const marketId = marketRows[0]?.id;
  if (!marketId) return 0;

  const rows = await sql<{ volume: string }[]>`
    SELECT COALESCE(SUM(quantity), 0)::text AS volume
    FROM ex_execution
    WHERE market_id = ${marketId}::uuid
      AND created_at >= NOW() - INTERVAL '24 hours'
  `;
  const v = rows[0]?.volume ? Number(rows[0].volume) : 0;
  return Number.isFinite(v) ? v : 0;
}

function spreadBpsFrom(bid: number | null, ask: number | null): number {
  if (!bid || !ask) return 0;
  const mid = (bid + ask) / 2;
  if (!Number.isFinite(mid) || mid <= 0) return 0;
  return ((ask - bid) / mid) * 10_000;
}

export async function analyzeMarketRegime(exchange: string, symbol: string): Promise<RegimeReport> {
  const ex = (exchange ?? "").trim().toLowerCase();

  // 1. Fetch Data
  const candles = ex === "internal" ? await fetchInternalOHLCV(symbol, "1h", 48) : await fetchOHLCV(ex, symbol, "1h", 48);

  let fundingRate = 0;
  if (ex !== "internal") {
    const funding = await getExchangeFundingRates(ex).catch(() => [] as any[]);
    const specificFunding = funding.find(
      (f) => f.symbol === symbol || String(f.symbol ?? "").replace("/", "") === symbol.replace("/", ""),
    );
    fundingRate = specificFunding?.fundingRate ?? 0;
  }

  const currentPrice = candles.length ? candles[candles.length - 1]![4] : 0;
  
  // 2. Compute Metrics
  let volatilityScore = 50;
  let trendScore = 0; // +100 (Strong Up) to -100 (Strong Down)
  
  if (candles.length > 20) {
      const closes = candles.map((c: number[]) => c[4]);
      
      // ATR-like volatility (just close-to-close stddev for simplicity here, real ATR is better but this works for MVP)
      const returns = closes.map((c, i) => i === 0 ? 0 : (c - closes[i-1]) / closes[i-1]);
      const vol = calcStdDev(returns.slice(1)); 
      
      // Normalize Volatility: 1% stddev hourly is huge. 0.1% is low.
      volatilityScore = Math.min(100, Math.max(0, (vol * 100) * 20)); // Scaling factor

      // Trend: SMA 24 vs Current
      const sma24 = closes.slice(-24).reduce((a, b) => a + b, 0) / 24;
      const dist = (currentPrice - sma24) / sma24;
      trendScore = Math.min(100, Math.max(-100, dist * 1000)); // 1% away = score 10
  }

  // 3. Classify Regime
  let regime: Regime = "RANGING_QUIET";
  if (volatilityScore > 75) regime = "RANGING_VOLATILE";
  if (trendScore > 20) regime = "TRENDING_UP";
  if (trendScore < -20) regime = "TRENDING_DOWN";
  if (volatilityScore > 90 && trendScore < -30) regime = "CRASH_RISK";

  // 4. Recommend Strategy
  let recommendation: StrategyRecommendation = "STAY_FLAT";
  let reason = "Data insufficient";

  if (regime === "RANGING_QUIET") {
      recommendation = "GRID_NEUTRAL";
      reason = "Low volatility suitable for mean reversion grid.";
  } else if (regime === "RANGING_VOLATILE") {
      recommendation = "STAY_FLAT";
      reason = "Volatility too high for safe grid trading.";
  } else if (regime === "TRENDING_UP") {
      // Check funding
      if (fundingRate > 0.001) { // > 0.1% per 8h is expensive to long
          recommendation = "CASH_CARRY"; 
          reason = `Strong uptrend but funding is expensive (${(fundingRate*100).toFixed(3)}%). Arbitrage opportunity.`;
      } else {
          recommendation = "TREND_FOLLOW";
          reason = "Uptrend established. Buy spot or long perps.";
      }
  } else if (regime === "TRENDING_DOWN") {
      recommendation = "TREND_FOLLOW";
      reason = "Downtrend active. Sell spot or short perps.";
  } else if (regime === "CRASH_RISK") {
      recommendation = "STAY_FLAT";
      reason = "Extreme downside volatility detected. Halt trading.";
  }

  // Override for extreme funding logic
  if (fundingRate > 0.0005 && regime !== "CRASH_RISK") {
       // > 0.05% is decent yield
       // If market is quiet, Cash & Carry is strictly better than grid often
       if (regime === "RANGING_QUIET") {
           recommendation = "CASH_CARRY";
           reason = "High funding rate in sideways market. Risk-free yield preferred.";
       }
  }

  return {
    symbol,
    regime,
    recommendation,
    metrics: {
        fundingRate,
        volatilityScore,
        spreadBps: await (async () => {
          if (ex === "internal") {
            const book = await fetchInternalTopOfBook(symbol).catch(() => null);
            return spreadBpsFrom(book?.bid ?? null, book?.ask ?? null);
          }

          try {
            const ccxtEx = createCcxtPublic(ex);
            const ccxtSymbol = symbol.includes("/") ? symbol : symbol.replace("USDT", "/USDT");
            const t: any = await (ccxtEx as any).fetchTicker(ccxtSymbol);
            const bid = typeof t?.bid === "number" ? t.bid : Number(t?.bid);
            const ask = typeof t?.ask === "number" ? t.ask : Number(t?.ask);
            return spreadBpsFrom(Number.isFinite(bid) ? bid : null, Number.isFinite(ask) ? ask : null);
          } catch {
            return 0;
          }
        })(),
        volume24h: await (async () => {
          if (ex === "internal") {
            return await fetchInternalVolume24h(symbol).catch(() => 0);
          }
          try {
            const ccxtEx = createCcxtPublic(ex);
            const ccxtSymbol = symbol.includes("/") ? symbol : symbol.replace("USDT", "/USDT");
            const t: any = await (ccxtEx as any).fetchTicker(ccxtSymbol);
            const qv = typeof t?.quoteVolume === "number" ? t.quoteVolume : Number(t?.quoteVolume);
            const bv = typeof t?.baseVolume === "number" ? t.baseVolume : Number(t?.baseVolume);
            const v = Number.isFinite(qv) && qv > 0 ? qv : Number.isFinite(bv) && bv > 0 ? bv : 0;
            return Number.isFinite(v) ? v : 0;
          } catch {
            return 0;
          }
        })()
    },
    reason
  };
}
