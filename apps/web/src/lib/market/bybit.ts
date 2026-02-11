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
  const symbolUpper = symbol.toUpperCase();
  const baseCandidates = [
    process.env.BYBIT_PUBLIC_API_URL,
    process.env.BYBIT_API_URL,
    "https://api2.bybit.com",
    "https://api.bybit.com",
    // Alternate domain used in some regions
    "https://api.bytick.com",
  ].filter(Boolean) as string[];

  const timeoutMs = (() => {
    const raw = process.env.BYBIT_TICKER_TIMEOUT_MS;
    const v = raw ? Number(raw) : NaN;
    // Default to a more forgiving timeout if unset, but allow envs to reduce it.
    if (!Number.isFinite(v) || v <= 0) return 15_000;
    return Math.max(2_000, v);
  })();

  const startedAt = Date.now();
  let lastErr: unknown;
  for (const base of baseCandidates) {
    const elapsed = Date.now() - startedAt;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) break;
    const attemptTimeoutMs = Math.min(5_000, remaining);
    const url = new URL(`${base.replace(/\/$/, "")}/v5/market/tickers`);
    url.searchParams.set("category", "spot");
    url.searchParams.set("symbol", symbolUpper);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);

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
    } catch (e) {
      lastErr = e;
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`bybit_ticker_failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}
