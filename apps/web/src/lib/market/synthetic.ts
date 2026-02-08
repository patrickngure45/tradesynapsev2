import type { ExchangeId, MarketSnapshot } from "./types";

export function stringifyUnknownError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function syntheticMarketSnapshot(
  exchange: ExchangeId,
  symbol: string,
  init?: { reason?: string; err?: unknown }
): MarketSnapshot {
  const upper = symbol.toUpperCase();
  const base =
    upper === "BTCUSDT"
      ? 65000
      : upper === "ETHUSDT"
        ? 3500
        : upper.endsWith("USDT")
          ? 100
          : 1000;

  const bid = (base * 0.9995).toFixed(2);
  const ask = (base * 1.0005).toFixed(2);
  const last = base.toFixed(2);

  return {
    exchange,
    symbol: upper,
    ts: new Date(),
    last,
    bid,
    ask,
    raw: {
      synthetic: true,
      reason: init?.reason ?? "market_snapshot_unavailable",
      error: typeof init?.err === "undefined" ? undefined : stringifyUnknownError(init.err),
    },
  };
}
