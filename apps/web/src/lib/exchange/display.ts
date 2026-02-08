/**
 * Pure display-formatting helpers for exchange market data.
 * No React / DOM dependencies — safe to use anywhere.
 */

import { cmp3818, fromBigInt3818, toBigInt3818 } from "@/lib/exchange/fixed3818";
import type { MarketStats, TopLevel } from "@/app/exchange/types";

const SCALE = 10n ** 18n;

/* ── number formatting ───────────────────────────────────────────── */

export function formatDecimal(value: string, digits: number): string {
  if (!Number.isFinite(digits) || digits < 0) return value;
  const [i, f = ""] = value.split(".");
  if (digits === 0) return i;
  return `${i}.${(f + "0".repeat(digits)).slice(0, digits)}`;
}

/* ── 24 h change ─────────────────────────────────────────────────── */

export function getChangeDisplay(stats: MarketStats): { text: string; arrow: string; className: string } {
  try {
    const openBi = toBigInt3818(stats.open);
    const lastBi = toBigInt3818(stats.last);
    if (openBi === 0n) return { text: "—", arrow: "", className: "" };

    const deltaBi = lastBi - openBi;
    const up = deltaBi >= 0n;
    const absDelta = up ? deltaBi : -deltaBi;

    const pctBi = (absDelta * 100n * SCALE) / openBi;
    const pctStr = fromBigInt3818(pctBi);
    const arrow = up ? "▲" : "▼";
    const className = up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
    const sign = up ? "+" : "-";
    return { text: `${sign}${formatDecimal(pctStr, 2)}%`, arrow, className };
  } catch {
    return { text: "—", arrow: "", className: "" };
  }
}

/* ── range position ──────────────────────────────────────────────── */

export function getRangePositionPct(stats: MarketStats): number | null {
  try {
    const lowBi = toBigInt3818(stats.low);
    const highBi = toBigInt3818(stats.high);
    const lastBi = toBigInt3818(stats.last);
    const span = highBi - lowBi;
    if (span <= 0n) return null;

    let num = lastBi - lowBi;
    if (num < 0n) num = 0n;
    if (num > span) num = span;

    const pct = Number((num * 10000n) / span) / 100;
    if (!Number.isFinite(pct)) return null;
    return Math.max(0, Math.min(100, pct));
  } catch {
    return null;
  }
}

/* ── spread ───────────────────────────────────────────────────────── */

export function getSpreadDisplay(
  bid: TopLevel | null,
  ask: TopLevel | null,
): { spread: string; bps: string; bpsX100: bigint; mid: string; midBi: bigint } | null {
  try {
    if (!bid?.price || !ask?.price) return null;
    const bidBi = toBigInt3818(bid.price);
    const askBi = toBigInt3818(ask.price);
    if (bidBi <= 0n || askBi <= 0n) return null;
    if (askBi < bidBi) return null;

    const spreadBi = askBi - bidBi;
    const spread = fromBigInt3818(spreadBi);

    const midBi = (askBi + bidBi) / 2n;
    const mid = fromBigInt3818(midBi);

    const bpsBi = (spreadBi * 10_000n * SCALE) / bidBi;
    const bps = formatDecimal(fromBigInt3818(bpsBi), 2);

    const bpsX100 = (spreadBi * 10_000n * 100n) / bidBi;

    return { spread, bps, bpsX100, mid, midBi };
  } catch {
    return null;
  }
}

/* ── mark vs VWAP ────────────────────────────────────────────────── */

export function getMarkVsVwapDisplay(
  stats: MarketStats,
  markBi: bigint,
): { text: string; className: string } {
  try {
    const vwapStr = stats.vwap;
    if (!vwapStr) return { text: "—", className: "" };
    const vwapBi = toBigInt3818(vwapStr);
    if (vwapBi <= 0n) return { text: "—", className: "" };

    const delta = markBi - vwapBi;
    const up = delta >= 0n;
    const absDelta = up ? delta : -delta;

    const pctBi = (absDelta * 100n * SCALE) / vwapBi;
    const pctStr = fromBigInt3818(pctBi);

    const cls = up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
    const sign = up ? "+" : "-";
    return { text: `${sign}${formatDecimal(pctStr, 2)}%`, className: cls };
  } catch {
    return { text: "—", className: "" };
  }
}

export function getMarkMinusVwapDisplay(
  stats: MarketStats,
  markBi: bigint,
  digits: number,
): { text: string; className: string } {
  try {
    const vwapStr = stats.vwap;
    if (!vwapStr) return { text: "—", className: "" };
    const vwapBi = toBigInt3818(vwapStr);
    if (vwapBi <= 0n) return { text: "—", className: "" };

    const delta = markBi - vwapBi;
    const up = delta >= 0n;
    const absDelta = up ? delta : -delta;
    const sign = up ? "+" : "-";

    const deltaStr = fromBigInt3818(absDelta);
    const cls = up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
    return { text: `${sign}${formatDecimal(deltaStr, digits)}`, className: cls };
  } catch {
    return { text: "—", className: "" };
  }
}
