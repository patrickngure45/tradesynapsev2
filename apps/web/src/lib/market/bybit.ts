import { z } from "zod";

import type { MarketSnapshot } from "./types";

const bybitTickersSchema = z.object({
  retCode: z.number(),
  retMsg: z.string().optional(),
  result: z
    .object({
      category: z.string().optional(),
      list: z
        .array(
          z.object({
            symbol: z.string(),
            lastPrice: z.string().optional(),
            bid1Price: z.string().optional(),
            ask1Price: z.string().optional(),
          })
        )
        .default([]),
    })
    .optional(),
});

export async function fetchBybitSpotTicker(symbol: string): Promise<MarketSnapshot> {
  const url = new URL("https://api.bybit.com/v5/market/tickers");
  url.searchParams.set("category", "spot");
  url.searchParams.set("symbol", symbol.toUpperCase());

  const controller = new AbortController();
  const timeoutMs = (() => {
    const raw = process.env.BYBIT_TICKER_TIMEOUT_MS;
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) && v > 0 ? v : 15_000;
  })();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "application/json",
        "user-agent": "TradeSynapse/1.0 (+https://tradesynapse.app)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`bybit_http_${response.status}: ${text.slice(0, 300)}`);
    }

    const json = await response.json();
    const parsed = bybitTickersSchema.parse(json);

    if (parsed.retCode !== 0) {
      throw new Error(`bybit_retCode_${parsed.retCode}: ${parsed.retMsg ?? ""}`);
    }

    const entry = parsed.result?.list?.[0];
    if (!entry) {
      throw new Error("bybit_no_ticker");
    }

    return {
      exchange: "bybit",
      symbol: entry.symbol,
      ts: new Date(),
      last: entry.lastPrice ?? null,
      bid: entry.bid1Price ?? null,
      ask: entry.ask1Price ?? null,
      raw: json,
    };
  } finally {
    clearTimeout(timeout);
  }
}
