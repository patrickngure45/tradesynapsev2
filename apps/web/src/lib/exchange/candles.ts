/**
 * 1-minute OHLCV candle helpers (pure — no side effects).
 */

import { add3818, cmp3818 } from "@/lib/exchange/fixed3818";
import type { Candle, Trade } from "@/lib/exchange/types";

export function bucket1mUtcIso(createdAtIso: string): string {
  const d = new Date(createdAtIso);
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0, 0);
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function buildCandlesFromTrades(trades: Trade[], limit: number): Candle[] {
  const sorted = trades
    .slice()
    .sort((a, b) => {
      if (a.created_at < b.created_at) return -1;
      if (a.created_at > b.created_at) return 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const byTs = new Map<string, Candle>();

  for (const t of sorted) {
    const ts = bucket1mUtcIso(t.created_at);
    const existing = byTs.get(ts);
    if (!existing) {
      byTs.set(ts, {
        ts,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: t.quantity,
        trade_count: 1,
      });
      continue;
    }

    existing.close = t.price;
    if (cmp3818(t.price, existing.high) > 0) existing.high = t.price;
    if (cmp3818(t.price, existing.low) < 0) existing.low = t.price;
    existing.volume = add3818(existing.volume, t.quantity);
    existing.trade_count += 1;
  }

  const candles = Array.from(byTs.values()).sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return candles.slice(Math.max(0, candles.length - limit));
}

export function applyTradesDeltaToCandles(prev: Candle[], deltaTrades: Trade[], limit: number): Candle[] {
  if (deltaTrades.length === 0) return prev;
  const next = prev.slice();

  const sorted = deltaTrades
    .slice()
    .sort((a, b) => {
      if (a.created_at < b.created_at) return -1;
      if (a.created_at > b.created_at) return 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  for (const t of sorted) {
    const ts = bucket1mUtcIso(t.created_at);
    const last = next[next.length - 1];

    if (!last || last.ts < ts) {
      next.push({
        ts,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: t.quantity,
        trade_count: 1,
      });
      continue;
    }

    if (last.ts === ts) {
      last.close = t.price;
      if (cmp3818(t.price, last.high) > 0) last.high = t.price;
      if (cmp3818(t.price, last.low) < 0) last.low = t.price;
      last.volume = add3818(last.volume, t.quantity);
      last.trade_count += 1;
      continue;
    }

    const idx = next.findIndex((c) => c.ts === ts);
    if (idx === -1) {
      next.push({
        ts,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: t.quantity,
        trade_count: 1,
      });
      next.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    } else {
      const c = next[idx]!;
      c.close = t.price;
      if (cmp3818(t.price, c.high) > 0) c.high = t.price;
      if (cmp3818(t.price, c.low) < 0) c.low = t.price;
      c.volume = add3818(c.volume, t.quantity);
      c.trade_count += 1;
    }
  }

  return next.slice(Math.max(0, next.length - limit));
}
