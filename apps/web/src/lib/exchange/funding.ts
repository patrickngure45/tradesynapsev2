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

// Only scan these exchanges for funding rates (liquid perps)
const FUNDING_EXCHANGES = ["binance", "bybit"];

// Minimum annualized yield to consider "Worthwhile" (e.g. 10%)
const MIN_YIELD_APR = 0.10;

export async function captureFundingSignals(sql: Sql) {
  const signals: any[] = [];
  const errors: any[] = [];

  const promises = FUNDING_EXCHANGES.map(async (exName) => {
    try {
      const rates = await getExchangeFundingRates(exName);
      
      for (const r of rates) {
        // Filter for USDT perps only usually
        if (!r.symbol.includes("USDT")) continue;

        // Basic sanity check: Logic assumes 8h funding interval (3x daily)
        // Some coins are 4h or 1h, but 8h is standard for major CEXs.
        const dailyRate = r.fundingRate * 3; 
        const apr = dailyRate * 365;

        if (apr < MIN_YIELD_APR) continue;

        // Create the standard "Signal" Payload
        const signal = {
           subject_type: "market_perp",
           subject_id: `${exName}:${r.symbol}`,
           kind: "funding_yield_high",
           score: Math.round(apr * 100), // Score = APR %
           recommended_action: "cash_and_carry",
           payload_json: {
             exchange: exName,
             symbol: r.symbol,
             fundingRate: r.fundingRate,
             dailyRatePct: dailyRate * 100,
             aprPct: apr * 100,
             nextFundingTime: r.nextFundingTimestamp
           }
        };
        signals.push(signal);
      }

    } catch (err) {
      errors.push({ exchange: exName, error: err instanceof Error ? err.message : String(err) });
    }
  });

  await Promise.allSettled(promises);

  // Insert signals into DB
  if (signals.length > 0) {
     // 1. Clear old funding signals for freshness? 
     // Or just append new ones. Let's delete old ones of this kind to keep the table clean for the dashboard.
     await sql`DELETE FROM app_signal WHERE kind = 'funding_yield_high' AND created_at < now() - interval '1 hour'`;

     // 2. Insert new
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
    SELECT * FROM app_signal 
    WHERE kind = 'funding_yield_high' 
    ORDER BY score DESC 
    LIMIT 50
  `;
}
