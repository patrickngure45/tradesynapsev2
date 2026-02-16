// Funding Rate & Basis Scanner
// Detects "Cash & Carry" opportunities (High Funding Rate = Short Perp + Buy Spot)

import type { Sql } from "postgres";
import { getExchangeFundingRates, type FundingRate } from "./externalApis";

export type FundingOpportunity = {
  symbol: string;
  exchange: string;
  fundingRate: number;
  predictedRate: number;
  annualizedYield: number; // (Funding Rate * 3 * 365)
  nextPayment: Date;
};

// Scan the exchanges we expose in the Connections UI.
// Note: some venues have separate CCXT ids for futures funding (e.g. KuCoin Futures).
const FUNDING_EXCHANGES: Array<{ exchange: string; ccxtFundingId: string }> = [
  { exchange: "binance", ccxtFundingId: "binance" },
  { exchange: "bybit", ccxtFundingId: "bybit" },
  { exchange: "okx", ccxtFundingId: "okx" },
  { exchange: "gateio", ccxtFundingId: "gateio" },
  { exchange: "bitget", ccxtFundingId: "bitget" },
  { exchange: "mexc", ccxtFundingId: "mexc" },
  { exchange: "kucoin", ccxtFundingId: "kucoinfutures" },
];

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

// Defaults are intentionally conservative to reduce false positives.
// Override via env if desired.
const MIN_YIELD_APR = envNumber("FUNDING_MIN_YIELD_APR", 0.12); // 12% APR

// Minimum 24h volume (quoted currency, typically USDT) to ensure liquidity.
// If volume is unavailable, we skip the market (conservative).
const MIN_VOLUME_24H = envNumber("FUNDING_MIN_VOLUME_24H", 10_000_000); // $10M daily volume

export async function captureFundingSignals(sql: Sql) {
  const signals: any[] = [];
  const errors: any[] = [];

  const promises = FUNDING_EXCHANGES.map(async ({ exchange, ccxtFundingId }) => {
    try {
      const rates = await getExchangeFundingRates(ccxtFundingId);
      
      for (const r of rates) {
        // Filter for USDT perps only usually
        if (!/\/USDT(?::|$)/i.test(r.symbol)) continue;

        // Skip illiquid / unknown-liquidity markets
        const volume24h = typeof r.volume24h === "number" ? r.volume24h : NaN;
        if (!Number.isFinite(volume24h) || volume24h < MIN_VOLUME_24H) continue;

        // Annualized funding estimate.
        // Prefer using timestamps to infer interval instead of assuming 8h.
        const intervalMs = Math.max(0, (r.nextFundingTimestamp ?? 0) - (r.fundingTimestamp ?? 0));
        const inferredPerDay = intervalMs > 30 * 60 * 1000 && intervalMs < 24 * 60 * 60 * 1000
          ? (24 * 60 * 60 * 1000) / intervalMs
          : 3; // fallback to 8h

        const dailyRate = r.fundingRate * inferredPerDay;
        const apr = dailyRate * 365;

        if (apr < MIN_YIELD_APR) continue;

        // Create the standard "Signal" Payload
        const aprPct = Number((apr * 100).toFixed(2));
        const signal = {
           subject_type: "market_perp",
           subject_id: `${exchange}:${r.symbol}`,
           kind: "funding_yield_high",
           score: aprPct, // Score = APR % (numeric)
           recommended_action: "cash_and_carry",
           payload_json: {
             exchange,
             symbol: r.symbol,
             fundingRate: r.fundingRate,
             dailyRatePct: dailyRate * 100,
             aprPct,
             nextFundingTime: r.nextFundingTimestamp,
             volume24h: r.volume24h
           }
        };
        signals.push(signal);
      }

    } catch (err) {
      errors.push({ exchange, error: err instanceof Error ? err.message : String(err) });
    }
  });

  await Promise.allSettled(promises);

  // Insert signals into DB
  if (signals.length > 0) {
     // Clear older signals and de-dup by subject_id so repeated scans don't spam the dashboard.
     await sql`DELETE FROM app_signal WHERE kind = 'funding_yield_high' AND created_at < now() - interval '1 hour'`;
     const subjectIds = Array.from(new Set(signals.map((s) => s.subject_id)));
     if (subjectIds.length > 0) {
       await sql`
         DELETE FROM app_signal
         WHERE kind = 'funding_yield_high'
           AND subject_id = ANY(${sql.array(subjectIds)})
       `;
     }

     // Insert new
     for (const sig of signals) {
        // Dedup: if we just inserted this signal recently, skip or update?
        // For simplicity, we just insert. The dashboard will pick the latest.
        await sql`
          INSERT INTO app_signal ${sql(sig, "subject_type", "subject_id", "kind", "score", "recommended_action", "payload_json")}
        `;
     }
  }

  return { signalsCount: signals.length, errors };
}

export async function getLatestFundingSignals(sql: Sql) {
  return sql`
    SELECT * FROM (
      SELECT DISTINCT ON (subject_id) *
      FROM app_signal
      WHERE kind = 'funding_yield_high'
      ORDER BY subject_id, created_at DESC
    ) t
    ORDER BY score DESC
    LIMIT 24
  `;
}
