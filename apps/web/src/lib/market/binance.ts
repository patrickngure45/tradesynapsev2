import { z } from "zod";

import type { MarketSnapshot } from "./types";

const binanceBookTickerSchema = z.object({
  symbol: z.string(),
  bidPrice: z.string().optional(),
  bidQty: z.string().optional(),
  askPrice: z.string().optional(),
  askQty: z.string().optional(),
});

export async function fetchBinanceBookTicker(symbol: string): Promise<MarketSnapshot> {
  const timeoutMs = (() => {
    const raw = process.env.BINANCE_TICKER_TIMEOUT_MS;
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) && v > 0 ? v : 12_000;
  })();

  const baseCandidates = [
    process.env.BINANCE_PUBLIC_API_URL,
    process.env.BINANCE_API_URL,
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
  ].filter(Boolean) as string[];

  let lastErr: unknown;
  for (const base of baseCandidates) {
    const url = new URL(`${base.replace(/\/$/, "")}/api/v3/ticker/bookTicker`);
    url.searchParams.set("symbol", symbol.toUpperCase());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "TradeSynapse/1.0 (+https://tradesynapse.app)",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`binance_http_${response.status}: ${text.slice(0, 300)}`);
      }

      const json = await response.json();
      const parsed = binanceBookTickerSchema.parse(json);

      return {
        exchange: "binance",
        symbol: parsed.symbol,
        ts: new Date(),
        last: null,
        bid: parsed.bidPrice ?? null,
        ask: parsed.askPrice ?? null,
        raw: json,
      };
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`binance_ticker_failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}
