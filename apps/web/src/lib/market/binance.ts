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
  const url = new URL("https://api.binance.com/api/v3/ticker/bookTicker");
  url.searchParams.set("symbol", symbol.toUpperCase());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "application/json",
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
  } finally {
    clearTimeout(timeout);
  }
}
