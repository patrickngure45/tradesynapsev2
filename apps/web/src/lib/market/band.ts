import type { MarketSnapshot } from "./types";

export type PriceBand = {
  mid: string;
  lower: string;
  upper: string;
  pct: number;
  basis: "bid_ask_mid" | "last";
};

function parseNum(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error("invalid_number");
  }
  return n;
}

export function computePriceBand(snapshot: MarketSnapshot, pct = 0.01): PriceBand {
  if (pct <= 0 || pct >= 0.5) {
    throw new Error("invalid_pct");
  }

  let mid: number;
  let basis: PriceBand["basis"];

  if (snapshot.bid && snapshot.ask) {
    mid = (parseNum(snapshot.bid) + parseNum(snapshot.ask)) / 2;
    basis = "bid_ask_mid";
  } else if (snapshot.last) {
    mid = parseNum(snapshot.last);
    basis = "last";
  } else {
    throw new Error("snapshot_missing_prices");
  }

  const lower = mid * (1 - pct);
  const upper = mid * (1 + pct);

  return {
    mid: mid.toString(),
    lower: lower.toString(),
    upper: upper.toString(),
    pct,
    basis,
  };
}

export function computeDeviationPct(quotePrice: string, mid: string): number {
  const q = parseNum(quotePrice);
  const m = parseNum(mid);
  if (m === 0) {
    throw new Error("mid_zero");
  }
  return Math.abs(q - m) / m;
}
