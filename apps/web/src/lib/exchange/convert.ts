import type { Sql } from "postgres";

import { getExternalIndexUsdt } from "@/lib/market/indexPrice";
import { getExchangeTicker } from "@/lib/exchange/externalApis";
import {
  add3818,
  bpsFeeCeil3818,
  mul3818Round,
  sub3818NonNegative,
  toBigInt3818,
} from "@/lib/exchange/fixed3818";

export type ConvertQuote = {
  fromSymbol: string;
  toSymbol: string;
  amountIn: string;
  feeIn: string;
  netIn: string;
  rateToPerFrom: string;
  amountOut: string;
  priceSource: {
    kind: "external_index_usdt" | "internal_fx" | "anchor";
    fromUsdt: number;
    toUsdt: number;
  };
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function convertFeeBps(): number {
  return Math.max(0, Math.min(10_000, envInt("CONVERT_FEE_BPS", 10)));
}

function normalizeAmount3818(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const fixed = value
    .toFixed(18)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
  return fixed.length === 0 ? "0" : fixed;
}

async function usdtPerAsset(
  sql: Sql,
  symRaw: string,
): Promise<{ usdt: number; kind: "external_index_usdt" | "anchor" | "internal_fx" } | null> {
  const sym = symRaw.trim().toUpperCase();
  if (!sym) return null;

  // Anchor currency: USDT (Binance-style)
  if (sym === "USDT") return { usdt: 1, kind: "anchor" };

  // Fast path: Binance spot ticker (single call)
  try {
    const t = await getExchangeTicker("binance", `${sym}USDT`);
    const bid = Number(t.bid);
    const ask = Number(t.ask);
    const last = Number(t.last);
    const mid = Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0 ? (bid + ask) / 2 : last;
    if (Number.isFinite(mid) && mid > 0) return { usdt: mid, kind: "external_index_usdt" };
  } catch {
    // fall through
  }

  const q = await getExternalIndexUsdt(sym);
  if (!q?.mid) return null;
  if (!Number.isFinite(q.mid) || q.mid <= 0) return null;
  return { usdt: q.mid, kind: "external_index_usdt" };
}

export async function quoteConvert(
  sql: Sql,
  params: {
    fromSymbol: string;
    toSymbol: string;
    amountIn: string;
    feeBps?: number;
  },
): Promise<ConvertQuote | null> {
  const fromSymbol = params.fromSymbol.trim().toUpperCase();
  const toSymbol = params.toSymbol.trim().toUpperCase();
  const amountIn = params.amountIn.trim();
  toBigInt3818(amountIn);
  if (toBigInt3818(amountIn) <= 0n) return null;
  if (!fromSymbol || !toSymbol) return null;
  if (fromSymbol === toSymbol) return null;

  const feeBps = typeof params.feeBps === "number" && Number.isFinite(params.feeBps)
    ? Math.max(0, Math.min(10_000, Math.trunc(params.feeBps)))
    : convertFeeBps();
  const feeIn = feeBps > 0 ? bpsFeeCeil3818(amountIn, feeBps) : "0";
  const netIn = sub3818NonNegative(amountIn, feeIn);
  if (toBigInt3818(netIn) <= 0n) return null;

  const [fromPx, toPx] = await Promise.all([usdtPerAsset(sql, fromSymbol), usdtPerAsset(sql, toSymbol)]);
  if (!fromPx || !toPx) return null;

  // rate: (USDT per FROM) / (USDT per TO) => TO per FROM
  const rate = fromPx.usdt / toPx.usdt;
  const rateToPerFrom = normalizeAmount3818(rate);
  if (toBigInt3818(rateToPerFrom) <= 0n) return null;

  const amountOut = mul3818Round(netIn, rateToPerFrom);
  if (toBigInt3818(amountOut) <= 0n) return null;

  return {
    fromSymbol,
    toSymbol,
    amountIn,
    feeIn,
    netIn,
    rateToPerFrom,
    amountOut,
    priceSource: {
      kind: fromPx.kind === "anchor" && toPx.kind === "anchor"
        ? "anchor"
        : (fromPx.kind === "internal_fx" || toPx.kind === "internal_fx")
          ? "internal_fx"
          : "external_index_usdt",
      fromUsdt: fromPx.usdt,
      toUsdt: toPx.usdt,
    },
  };
}

export type ConvertExecuteResult =
  | { ok: true; quote: ConvertQuote; entryId: string; createdAt: string }
  | { ok: false; error: string; details?: unknown };

export function buildConvertJournalLines(args: {
  userFromAcct: string;
  userToAcct: string;
  systemFromAcct: string;
  systemToAcct: string;
  treasuryFromAcct: string;
  fromAssetId: string;
  toAssetId: string;
  quote: ConvertQuote;
}): Array<{ accountId: string; assetId: string; amount: string }> {
  const q = args.quote;

  // Asset FROM: user pays amountIn; split into netIn (system) + feeIn (treasury)
  const lines: Array<{ accountId: string; assetId: string; amount: string }> = [];
  lines.push({ accountId: args.userFromAcct, assetId: args.fromAssetId, amount: `-${q.amountIn}` });

  if (toBigInt3818(q.netIn) > 0n) {
    lines.push({ accountId: args.systemFromAcct, assetId: args.fromAssetId, amount: q.netIn });
  }
  if (toBigInt3818(q.feeIn) > 0n) {
    lines.push({ accountId: args.treasuryFromAcct, assetId: args.fromAssetId, amount: q.feeIn });
  }

  // Asset TO: system delivers amountOut; user receives amountOut
  lines.push({ accountId: args.systemToAcct, assetId: args.toAssetId, amount: `-${q.amountOut}` });
  lines.push({ accountId: args.userToAcct, assetId: args.toAssetId, amount: q.amountOut });

  return lines;
}
