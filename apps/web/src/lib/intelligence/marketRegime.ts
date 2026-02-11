// Market Regime Classification Engine
// Analyzes market volatility, trend, and liquidity to classify the current state.

import { createCcxtPublic, type ExchangeTicker } from "@/lib/exchange/externalApis";
import { getExchangeFundingRates } from "@/lib/exchange/externalApis";

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

async function fetchOHLCV(exchangeId: string, symbol: string, timeframe = '1h', limit = 24): Promise<number[][]> {
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

export async function analyzeMarketRegime(exchange: string, symbol: string): Promise<RegimeReport> {
  // 1. Fetch Data
  const candles = await fetchOHLCV(exchange, symbol, '1h', 48); // 48 hours
  const funding = await getExchangeFundingRates(exchange).catch(() => [] as any[]);
  const specificFunding = funding.find(f => f.symbol === symbol || f.symbol.replace('/','') === symbol.replace('/',''));

  // Default Fallback
  const currentPrice = candles.length ? candles[candles.length - 1][4] : 0;
  const fundingRate = specificFunding?.fundingRate ?? 0;
  
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
        spreadBps: 0, // Placeholder
        volume24h: 0 // Placeholder
    },
    reason
  };
}
