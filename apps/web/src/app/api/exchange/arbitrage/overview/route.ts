import { NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError } from "@/lib/dbTransient";

import { decryptCredential } from "@/lib/auth/credentials";
import {
  getAuthenticatedTradingFee,
  getExchangeBalances,
  getExchangeMarketConstraints,
  getExchangeOrderBook,
  type ExchangeMarketConstraints,
  type ExchangeOrderBook,
} from "@/lib/exchange/externalApis";

import {
  captureArbSnapshots,
  detectOpportunities,
  getRecentSnapshots,
  type ArbSnapshot,
} from "@/lib/exchange/arbitrage";
import type { SupportedExchange } from "@/lib/exchange/externalApis";

import { getOrComputeFxReferenceRate } from "@/lib/fx/reference";
import { getExternalIndexUsdt } from "@/lib/market/indexPrice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

function latestPerSymbolExchange(snapshots: ArbSnapshot[]): ArbSnapshot[] {
  const byKey = new Map<string, ArbSnapshot>();
  for (const s of snapshots) {
    const key = `${s.symbol}::${s.exchange}`;
    const prev = byKey.get(key);
    if (!prev || s.ts > prev.ts) byKey.set(key, s);
  }
  return Array.from(byKey.values());
}

function normalizeExternalSymbol(base: string, quote: string) {
  return `${base}${quote}`.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

async function getEnabledAssetSymbols(sql: ReturnType<typeof getSql>): Promise<string[]> {
  const rows = await sql<{ symbol: string }[]>`
    SELECT symbol
    FROM ex_asset
    WHERE chain = 'bsc' AND is_enabled = true
    ORDER BY symbol ASC
  `;
  return rows.map((r) => String(r.symbol).toUpperCase());
}

function prioritizedCap<T>(items: T[], priority: (item: T) => number, cap: number): T[] {
  const sorted = [...items].sort((a, b) => priority(b) - priority(a));
  return sorted.slice(0, Math.max(0, cap));
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const concurrency = Math.max(1, Math.floor(limit));
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      await worker(items[idx]!);
    }
  });
  await Promise.allSettled(runners);
}

function parseBaseFromSymbol(symbol: string, quoteSuffix: string): string | null {
  const s = symbol.toUpperCase();
  const q = quoteSuffix.toUpperCase();
  if (!s.endsWith(q) || s.length <= q.length) return null;
  return s.slice(0, -q.length);
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return fallback;
}

function hashUnit(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const INTERNAL_SETTLEMENT_ENABLED = envBool("ARB_INTERNAL_SETTLEMENT_ENABLED", true);

function pctFromBps(bps: number): number {
  return bps / 100; // 100 bps = 1%
}

function vwapBuyForQuoteNotional(asks: Array<[number, number]>, quoteNotional: number) {
  // asks: [price, baseAmount]
  let remainingQuote = quoteNotional;
  let baseFilled = 0;
  let quoteSpent = 0;
  for (const [price, baseAvail] of asks) {
    if (remainingQuote <= 0) break;
    const levelQuote = price * baseAvail;
    const takeQuote = Math.min(levelQuote, remainingQuote);
    const takeBase = takeQuote / price;
    baseFilled += takeBase;
    quoteSpent += takeQuote;
    remainingQuote -= takeQuote;
  }
  if (!(quoteSpent > 0) || !(baseFilled > 0)) return null;
  const vwap = quoteSpent / baseFilled;
  const top = asks.length ? asks[0]![0] : vwap;
  const slippageBps = top > 0 ? ((vwap - top) / top) * 10_000 : 0;
  return { vwap, baseFilled, slippageBps };
}

function vwapSellForBaseAmount(bids: Array<[number, number]>, baseAmount: number) {
  // bids: [price, baseAmount]
  let remainingBase = baseAmount;
  let baseSold = 0;
  let quoteReceived = 0;
  for (const [price, baseAvail] of bids) {
    if (remainingBase <= 0) break;
    const takeBase = Math.min(baseAvail, remainingBase);
    baseSold += takeBase;
    quoteReceived += takeBase * price;
    remainingBase -= takeBase;
  }
  if (!(quoteReceived > 0) || !(baseSold > 0)) return null;
  const vwap = quoteReceived / baseSold;
  const top = bids.length ? bids[0]![0] : vwap;
  const slippageBps = top > 0 ? ((top - vwap) / top) * 10_000 : 0;
  return { vwap, quoteReceived, slippageBps };
}

function basePriority(symbol: string): number {
  // Bias toward liquidity/robustness first.
  const order = [
    "BTC",
    "ETH",
    "BNB",
    "SOL",
    "XRP",
    "ADA",
    "DOGE",
    "TRX",
    "LINK",
    "AVAX",
    "TON",
    "MATIC",
  ];
  const idx = order.indexOf(symbol.toUpperCase());
  return idx === -1 ? 0 : 1000 - idx;
}

async function getUserActiveVenues(sql: ReturnType<typeof getSql>, userId: string): Promise<SupportedExchange[]> {
  const rows = await sql<{ exchange: string }[]>`
    SELECT exchange
    FROM user_exchange_connection
    WHERE user_id = ${userId}::uuid
      AND status = 'active'
    GROUP BY exchange
    ORDER BY exchange ASC
  `;

  const allow = new Set<SupportedExchange>([
    "binance",
    "bybit",
    "okx",
    "kucoin",
    "gateio",
    "bitget",
    "mexc",
  ]);

  return rows
    .map((r) => String(r.exchange).toLowerCase())
    .filter((e): e is SupportedExchange => allow.has(e as SupportedExchange));
}

function getDefaultPublicVenues(): SupportedExchange[] {
  const allow = new Set<SupportedExchange>([
    "binance",
    "bybit",
    "okx",
    "kucoin",
    "gateio",
    "bitget",
    "mexc",
  ]);
  const raw = process.env.ARB_PUBLIC_VENUES;
  if (raw) {
    const list = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const venues = list.filter((v): v is SupportedExchange => allow.has(v as SupportedExchange));
    if (venues.length > 0) return venues;
  }
  return ["binance", "bybit", "okx"]; // sane defaults
}

async function getUserVenueCredentials(
  sql: ReturnType<typeof getSql>,
  userId: string,
  venues: SupportedExchange[],
): Promise<Record<string, { apiKey: string; apiSecret: string; passphrase?: string }>> {
  if (!venues.length) return {};
  const rows = await sql<
    Array<{
      exchange: string;
      api_key_enc: string;
      api_secret_enc: string;
      passphrase_enc: string | null;
      created_at: string;
    }>
  >`
    SELECT exchange, api_key_enc, api_secret_enc, passphrase_enc, created_at
    FROM user_exchange_connection
    WHERE user_id = ${userId}::uuid
      AND status = 'active'
      AND exchange IN (${sql(venues)})
    ORDER BY exchange ASC, created_at DESC
  `;

  const out: Record<string, { apiKey: string; apiSecret: string; passphrase?: string }> = {};
  for (const r of rows) {
    const ex = String(r.exchange).toLowerCase();
    if (out[ex]) continue; // keep most recent per exchange
    out[ex] = {
      apiKey: decryptCredential(r.api_key_enc),
      apiSecret: decryptCredential(r.api_secret_enc),
      ...(r.passphrase_enc ? { passphrase: decryptCredential(r.passphrase_enc) } : {}),
    };
  }
  return out;
}

type VenueBalanceSnapshot = {
  exchange: string;
  checkedAt: string;
  ok: boolean;
  error?: string;
  assets?: Record<string, { free: number; locked: number }>;
};

type VenueFeeSnapshot = {
  exchange: string;
  checkedAt: string;
  ok: boolean;
  taker?: number | null; // fraction
  maker?: number | null; // fraction
  source?: string;
  error?: string;
};

async function fetchVenueFees(
  venues: SupportedExchange[],
  credsByVenue: Record<string, { apiKey: string; apiSecret: string; passphrase?: string }>,
  feeSymbol: string,
): Promise<Record<string, VenueFeeSnapshot>> {
  const out: Record<string, VenueFeeSnapshot> = {};
  const limit = clamp(envNumber("ARB_FEE_CONCURRENCY", 3), 1, 6);

  await runWithConcurrency(venues, limit, async (venue) => {
    const ex = venue.toLowerCase();
    const creds = credsByVenue[ex];
    if (!creds) {
      out[ex] = { exchange: ex, checkedAt: new Date().toISOString(), ok: false, error: "missing_credentials" };
      return;
    }
    try {
      const fee = await getAuthenticatedTradingFee(venue, creds, feeSymbol);
      out[ex] = {
        exchange: ex,
        checkedAt: new Date().toISOString(),
        ok: true,
        taker: fee.taker,
        maker: fee.maker,
        source: fee.source,
      };
    } catch (e) {
      out[ex] = {
        exchange: ex,
        checkedAt: new Date().toISOString(),
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  return out;
}

type DepthKey = string;
function depthKey(exchange: string, symbol: string): DepthKey {
  return `${exchange.toLowerCase()}::${symbol.toUpperCase()}`;
}

type ConstraintKey = string;
function constraintKey(exchange: string, symbol: string): ConstraintKey {
  return `${exchange.toLowerCase()}::${symbol.toUpperCase()}`;
}

function floorToPrecision(value: number, precision: number | null): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (precision === null || !Number.isFinite(precision) || precision < 0) return value;
  const p = Math.min(12, Math.max(0, Math.floor(precision)));
  const factor = 10 ** p;
  return Math.floor(value * factor) / factor;
}

async function fetchConstraintsForPairs(
  pairs: Array<{ exchange: SupportedExchange; symbol: string }>,
): Promise<Map<ConstraintKey, ExchangeMarketConstraints>> {
  const unique = new Map<ConstraintKey, { exchange: SupportedExchange; symbol: string }>();
  for (const p of pairs) unique.set(constraintKey(p.exchange, p.symbol), p);
  const items = Array.from(unique.values());
  const limit = clamp(envNumber("ARB_CONSTRAINTS_CONCURRENCY", 4), 1, 8);
  const out = new Map<ConstraintKey, ExchangeMarketConstraints>();

  await runWithConcurrency(items, limit, async (p) => {
    const k = constraintKey(p.exchange, p.symbol);
    const c = await getExchangeMarketConstraints(p.exchange, p.symbol);
    out.set(k, c);
  });

  return out;
}

async function fetchDepthForPairs(pairs: Array<{ exchange: SupportedExchange; symbol: string }>): Promise<Map<DepthKey, ExchangeOrderBook>> {
  const unique = new Map<DepthKey, { exchange: SupportedExchange; symbol: string }>();
  for (const p of pairs) unique.set(depthKey(p.exchange, p.symbol), p);
  const items = Array.from(unique.values());
  const limit = clamp(envNumber("ARB_DEPTH_CONCURRENCY", 4), 1, 8);
  const obLimit = clamp(envNumber("ARB_ORDERBOOK_LIMIT", 50), 10, 200);
  const out = new Map<DepthKey, ExchangeOrderBook>();

  await runWithConcurrency(items, limit, async (p) => {
    const k = depthKey(p.exchange, p.symbol);
    const ob = await getExchangeOrderBook(p.exchange, p.symbol, { limit: obLimit });
    out.set(k, ob);
  });

  return out;
}

async function fetchVenueBalances(
  venues: SupportedExchange[],
  credsByVenue: Record<string, { apiKey: string; apiSecret: string; passphrase?: string }>,
  relevantAssets: string[],
): Promise<Record<string, VenueBalanceSnapshot>> {
  const out: Record<string, VenueBalanceSnapshot> = {};
  const assetsSet = new Set(relevantAssets.map((a) => a.toUpperCase()));
  const limit = clamp(envNumber("ARB_BALANCE_CONCURRENCY", 3), 1, 6);

  await runWithConcurrency(venues, limit, async (venue) => {
    const ex = venue.toLowerCase();
    const creds = credsByVenue[ex];
    if (!creds) {
      out[ex] = { exchange: ex, checkedAt: new Date().toISOString(), ok: false, error: "missing_credentials" };
      return;
    }
    try {
      const balances = await getExchangeBalances(venue, creds);
      const assets: Record<string, { free: number; locked: number }> = {};
      for (const b of balances) {
        const asset = String(b.asset).toUpperCase();
        if (!assetsSet.has(asset)) continue;
        const free = Number(b.free);
        const locked = Number(b.locked);
        assets[asset] = {
          free: Number.isFinite(free) ? free : 0,
          locked: Number.isFinite(locked) ? locked : 0,
        };
      }
      out[ex] = { exchange: ex, checkedAt: new Date().toISOString(), ok: true, assets };
    } catch (e) {
      out[ex] = {
        exchange: ex,
        checkedAt: new Date().toISOString(),
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  return out;
}

async function getInternalUsdtMarkets(sql: ReturnType<typeof getSql>, bases: string[]) {
  if (bases.length === 0) return [] as Array<{ base: string; symbol: string; bid: number; ask: number; mid: number; ts: string }>;

  // Pull best bid/ask for base/USDT markets from open orderbook; if missing, fall back to last execution.
  const rows = await sql<
    Array<{
      symbol: string;
      base_symbol: string;
      bid: string | null;
      ask: string | null;
      last: string | null;
      last_ts: string | null;
    }>
  >`
    WITH mk AS (
      SELECT m.id, m.symbol, ab.symbol AS base_symbol
      FROM ex_market m
      JOIN ex_asset ab ON ab.id = m.base_asset_id
      JOIN ex_asset aq ON aq.id = m.quote_asset_id
      WHERE m.status = 'enabled'
        AND ab.chain = 'bsc'
        AND aq.chain = 'bsc'
        AND aq.symbol = 'USDT'
        AND ab.symbol = ANY(${sql.array(bases.map((b) => b.toUpperCase()))})
    ),
    best_bid AS (
      SELECT o.market_id, max(o.price)::text AS bid
      FROM ex_order o
      WHERE o.side = 'buy' AND o.status IN ('open','partially_filled')
      GROUP BY o.market_id
    ),
    best_ask AS (
      SELECT o.market_id, min(o.price)::text AS ask
      FROM ex_order o
      WHERE o.side = 'sell' AND o.status IN ('open','partially_filled')
      GROUP BY o.market_id
    ),
    last_exec AS (
      SELECT DISTINCT ON (e.market_id) e.market_id, e.price::text AS last, e.created_at::text AS last_ts
      FROM ex_execution e
      ORDER BY e.market_id, e.created_at DESC
    )
    SELECT mk.symbol, mk.base_symbol,
           bb.bid, ba.ask,
           le.last, le.last_ts
    FROM mk
    LEFT JOIN best_bid bb ON bb.market_id = mk.id
    LEFT JOIN best_ask ba ON ba.market_id = mk.id
    LEFT JOIN last_exec le ON le.market_id = mk.id
  `;

  const fallbackSpreadBps = clamp(envNumber("ARB_INTERNAL_FALLBACK_SPREAD_BPS", 30), 1, 500);
  const half = fallbackSpreadBps / 2 / 10_000;

  const out: Array<{ base: string; symbol: string; bid: number; ask: number; mid: number; ts: string }> = [];
  for (const r of rows) {
    const bid = r.bid ? Number(r.bid) : NaN;
    const ask = r.ask ? Number(r.ask) : NaN;
    if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
      out.push({
        base: String(r.base_symbol).toUpperCase(),
        symbol: String(r.symbol),
        bid,
        ask,
        mid: (bid + ask) / 2,
        ts: new Date().toISOString(),
      });
      continue;
    }

    const last = r.last ? Number(r.last) : NaN;
    if (!Number.isFinite(last) || last <= 0) continue;

    out.push({
      base: String(r.base_symbol).toUpperCase(),
      symbol: String(r.symbol),
      bid: last * (1 - half),
      ask: last * (1 + half),
      mid: last,
      ts: r.last_ts ? String(r.last_ts) : new Date().toISOString(),
    });
  }

  return out;
}

export async function GET(req: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(req);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });
  if (!actingUserId) return NextResponse.json({ error: "missing_x_user_id" }, { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "latest";

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return NextResponse.json({ error: activeErr }, { status: 403 });

    const connectedVenues = await getUserActiveVenues(sql, actingUserId);
    const scanVenues = connectedVenues.length > 0 ? connectedVenues : getDefaultPublicVenues();

    // Enabled assets from master wallet; we will scan a capped subset to keep API calls realistic.
    const enabledAssets = await getEnabledAssetSymbols(sql);
    const enabledBases = enabledAssets.filter((s) => s !== "USDT");

    const maxSymbols = clamp(envNumber("ARB_MAX_SYMBOLS", 30), 5, 200);
    const cappedBases = prioritizedCap(enabledBases, (b) => basePriority(String(b)), maxSymbols);

    const trackedSymbols = cappedBases.map((b) => normalizeExternalSymbol(String(b), "USDT"));

    const externalErrors: Array<{ error: string; message: string }> = [];
    if (trackedSymbols.length === 0) {
      externalErrors.push({ error: "no_symbols", message: "No enabled assets are available to scan." });
    }

    const minUsd = clamp(envNumber("ARB_MIN_NOTIONAL_USD", 25), 5, 500);
    const maxUsdHardCap = clamp(envNumber("ARB_NOTIONAL_USD_CAP", 1000), minUsd, 100_000);
    const notionalUsd = clamp(envNumber("ARB_NOTIONAL_USD", minUsd), minUsd, maxUsdHardCap);

    if (connectedVenues.length === 0) {
      externalErrors.push({
        error: "no_exchange_connections",
        message: "No exchange APIs connected yet. Scan uses public market data; connect an exchange API to unlock balance checks + execution readiness.",
      });
    }

    const includeInternalPrices = false; // external arb is external-only; internal-vs-index is computed separately.

    const balancesEnabled = process.env.ARB_BALANCES_ENABLED !== "0";
    const includeBalances = balancesEnabled && action === "scan" && connectedVenues.length > 0;
    let venueBalances: Record<string, VenueBalanceSnapshot> | null = null;

    const includeFees = envBool("ARB_FEES_ENABLED", true) && action === "scan" && connectedVenues.length > 0;
    let venueFees: Record<string, VenueFeeSnapshot> | null = null;

    const includeDepth = envBool("ARB_DEPTH_ENABLED", true) && action === "scan";
    let depthMap: Map<DepthKey, ExchangeOrderBook> | null = null;

    const includeConstraints = envBool("ARB_CONSTRAINTS_ENABLED", true) && action === "scan";
    let constraintsMap: Map<ConstraintKey, ExchangeMarketConstraints> | null = null;

    let latest: ArbSnapshot[] = [];
    let scanErrors: unknown[] = [];

    if (action === "scan" && trackedSymbols.length > 0) {
      const scan = await captureArbSnapshots(sql, {
        exchanges: scanVenues,
        symbols: trackedSymbols,
        includeInternalPrices,
        storeSnapshots: true,
      });
      latest = latestPerSymbolExchange(scan.snapshots);
      scanErrors = scan.errors;

      if (includeBalances) {
        const creds = await getUserVenueCredentials(sql, actingUserId, connectedVenues);
        const relevantAssets = [
          "USDT",
          ...cappedBases.map((b) => String(b).toUpperCase()),
        ];
        venueBalances = await fetchVenueBalances(connectedVenues, creds, relevantAssets);

        // Fees (best-effort). Use BTCUSDT if available; otherwise first tracked symbol.
        if (includeFees) {
          const feeSymbol = trackedSymbols.includes("BTCUSDT") ? "BTCUSDT" : trackedSymbols[0]!;
          venueFees = await fetchVenueFees(connectedVenues, creds, feeSymbol);
        }
      }
    } else {
      const recent = await getRecentSnapshots(sql, undefined, 0.1);
      const filtered = recent.filter((s) => scanVenues.includes(String(s.exchange).toLowerCase() as SupportedExchange));
      latest = latestPerSymbolExchange(filtered);
    }

    // Precompute opps once (used for depth/constraints and final response).
    const rawOppsAny = detectOpportunities(latest, {
      minNetSpread: -100,
      oppExchanges: scanVenues,
      includeInternal: false,
      quoteSuffix: "USDT",
    });
    const rawOpps = rawOppsAny.filter((o) => o.netSpreadPct >= -1.0);

    // Depth (best-effort) for top opportunities only to avoid heavy API load.
    if (includeDepth) {
      const depthTopN = clamp(envNumber("ARB_DEPTH_TOP_N", 15), 0, 100);
      if (depthTopN > 0) {
        const prelim = rawOppsAny.slice(0, depthTopN);

        const pairs: Array<{ exchange: SupportedExchange; symbol: string }> = [];
        for (const o of prelim) {
          const buy = String(o.buyExchange).toLowerCase() as SupportedExchange;
          const sell = String(o.sellExchange).toLowerCase() as SupportedExchange;
          pairs.push({ exchange: buy, symbol: o.symbol });
          pairs.push({ exchange: sell, symbol: o.symbol });
        }
        try {
          depthMap = await fetchDepthForPairs(pairs);
        } catch {
          depthMap = null;
        }
      }
    }

    if (includeConstraints) {
      const topN = clamp(envNumber("ARB_CONSTRAINTS_TOP_N", 60), 0, 500);
      const target = topN > 0 ? rawOpps.slice(0, topN) : [];
      const pairs: Array<{ exchange: SupportedExchange; symbol: string }> = [];
      for (const o of target) {
        pairs.push({ exchange: String(o.buyExchange).toLowerCase() as SupportedExchange, symbol: o.symbol });
        pairs.push({ exchange: String(o.sellExchange).toLowerCase() as SupportedExchange, symbol: o.symbol });
      }
      try {
        constraintsMap = await fetchConstraintsForPairs(pairs);
      } catch {
        constraintsMap = null;
      }
    }

    const opportunities = rawOpps.map((o) => {
      const effectiveNotionalUsd = notionalUsd;

      const netProfitUsdTarget = (o.netSpreadPct / 100) * effectiveNotionalUsd;
      const grossProfitUsdTarget = (o.spreadPct / 100) * effectiveNotionalUsd;

      const base = parseBaseFromSymbol(o.symbol, "USDT");
      const quantityTarget = base && o.buyAsk > 0 ? effectiveNotionalUsd / o.buyAsk : null;

      const buyEx = String(o.buyExchange).toLowerCase();
      const sellEx = String(o.sellExchange).toLowerCase();
      const buyBal = venueBalances?.[buyEx];
      const sellBal = venueBalances?.[sellEx];

      let execution: {
        status: "ready" | "missing" | "unknown";
        blockers: string[];
        required?: { usdtBuy: number; baseSell: number; base: string };
        max?: { notionalUsd: number; baseSell: number; limitedBy: string[] };
      } | null = null;

      let execNotionalUsd = effectiveNotionalUsd;
      let execQuantity = quantityTarget;
      let limitedBy: string[] = [];

      if (venueBalances) {
        const blockers: string[] = [];
        if (!base || !quantityTarget || !Number.isFinite(quantityTarget) || quantityTarget <= 0) {
          blockers.push("invalid_quantity");
        }
        if (!buyBal || !buyBal.ok) blockers.push("buy_balance_unavailable");
        if (!sellBal || !sellBal.ok) blockers.push("sell_balance_unavailable");

        if (base && quantityTarget && buyBal?.ok && sellBal?.ok) {
          const usdtFree = buyBal.assets?.USDT?.free ?? 0;
          const baseFree = sellBal.assets?.[base]?.free ?? 0;

          const maxQtyByUsdt = o.buyAsk > 0 ? usdtFree / o.buyAsk : 0;
          const maxQty = Math.max(0, Math.min(maxQtyByUsdt, baseFree));
          const maxNotionalUsd = maxQty * (o.buyAsk > 0 ? o.buyAsk : 0);

          if (usdtFree + 1e-9 < effectiveNotionalUsd) blockers.push("insufficient_usdt_on_buy");
          if (baseFree + 1e-12 < quantityTarget) blockers.push("insufficient_base_on_sell");

          if (Number.isFinite(maxNotionalUsd) && maxNotionalUsd > 0 && maxNotionalUsd + 1e-9 < effectiveNotionalUsd) {
            execNotionalUsd = maxNotionalUsd;
            execQuantity = maxQty;
            if (maxQtyByUsdt + 1e-12 < baseFree) limitedBy.push("usdt");
            if (baseFree + 1e-12 < maxQtyByUsdt) limitedBy.push("base");
          }
        }

        const status = blockers.length === 0 ? "ready" : blockers.some((b) => b.includes("unavailable")) ? "unknown" : "missing";
        execution = {
          status,
          blockers,
          ...(base && quantityTarget
            ? { required: { usdtBuy: effectiveNotionalUsd, baseSell: quantityTarget, base } }
            : {}),
          ...(base && execQuantity && Number.isFinite(execNotionalUsd) && execNotionalUsd > 0
            ? {
                max: {
                  notionalUsd: execNotionalUsd,
                  baseSell: execQuantity,
                  limitedBy,
                },
              }
            : {}),
        };
      }

      // Venue constraints (best-effort): apply precision quantization + min amount/cost enforcement.
      const constraintBlockers: string[] = [];
      const buyC = constraintsMap?.get(constraintKey(buyEx, o.symbol)) ?? null;
      const sellC = constraintsMap?.get(constraintKey(sellEx, o.symbol)) ?? null;

      if (includeConstraints) {
        if (buyC && !buyC.ok) constraintBlockers.push("symbol_unavailable_buy");
        if (sellC && !sellC.ok) constraintBlockers.push("symbol_unavailable_sell");

        if (base && execNotionalUsd > 0 && o.buyAsk > 0) {
          const desiredQty = execNotionalUsd / o.buyAsk;
          const buyPrec = buyC?.ok ? buyC.amountPrecision : null;
          const sellPrec = sellC?.ok ? sellC.amountPrecision : null;
          const qtyPrecision = buyPrec === null ? sellPrec : sellPrec === null ? buyPrec : Math.min(buyPrec, sellPrec);
          const qty = floorToPrecision(desiredQty, qtyPrecision ?? null);
          if (qty > 0 && execQuantity && Number.isFinite(execQuantity) && qty + 1e-12 < execQuantity) {
            limitedBy = Array.from(new Set([...limitedBy, "precision"]));
          }
          execQuantity = qty > 0 ? qty : execQuantity;
          execNotionalUsd = execQuantity && o.buyAsk > 0 ? execQuantity * o.buyAsk : execNotionalUsd;

          // Min checks (only when we have concrete values)
          if (buyC?.ok && typeof buyC.amountMin === "number" && execQuantity && execQuantity > 0 && execQuantity < buyC.amountMin) {
            constraintBlockers.push("min_amount_buy");
          }
          if (sellC?.ok && typeof sellC.amountMin === "number" && execQuantity && execQuantity > 0 && execQuantity < sellC.amountMin) {
            constraintBlockers.push("min_amount_sell");
          }
          if (buyC?.ok && typeof buyC.costMin === "number" && execNotionalUsd > 0 && execNotionalUsd < buyC.costMin) {
            constraintBlockers.push("min_notional_buy");
          }
          const sellQuote = execQuantity && execQuantity > 0 ? execQuantity * o.sellBid : 0;
          if (sellC?.ok && typeof sellC.costMin === "number" && sellQuote > 0 && sellQuote < sellC.costMin) {
            constraintBlockers.push("min_notional_sell");
          }
        }

        if (execution && constraintBlockers.length > 0) {
          execution.status = "missing";
          execution.blockers = Array.from(new Set([...(execution.blockers ?? []), ...constraintBlockers]));
          if (execution.max) {
            execution.max.limitedBy = Array.from(new Set([...(execution.max.limitedBy ?? []), "constraints"]));
          }
        }

        // If constraints are known and blockers exist, drop the route (strict realism).
        if (constraintBlockers.length > 0) {
          return null;
        }
      }

      // Per-venue taker fees (fraction) with fallbacks.
      const fallbackTakerBps = Math.max(0, envNumber("ARB_TAKER_FEE_BPS", 10));
      const buyTaker = venueFees?.[buyEx]?.ok && typeof venueFees?.[buyEx]?.taker === "number"
        ? (venueFees![buyEx]!.taker as number)
        : fallbackTakerBps / 10_000;
      const sellTaker = venueFees?.[sellEx]?.ok && typeof venueFees?.[sellEx]?.taker === "number"
        ? (venueFees![sellEx]!.taker as number)
        : fallbackTakerBps / 10_000;

      const latencyBps = Math.max(0, envNumber("ARB_LATENCY_BPS", 2));
      const feePct = (buyTaker + sellTaker) * 100;
      const latencyPct = pctFromBps(latencyBps);

      // Depth-adjusted execution (VWAP) for execNotional if available.
      let depth: any = null;
      let netSpreadDepthPct: number | null = null;
      let netProfitDepthUsd: number | null = null;

      if (depthMap && base && Number.isFinite(execNotionalUsd) && execNotionalUsd > 0) {
        const buyOb = depthMap.get(depthKey(buyEx, o.symbol));
        const sellOb = depthMap.get(depthKey(sellEx, o.symbol));
        if (buyOb && sellOb && buyOb.asks.length && sellOb.bids.length) {
          const buy = vwapBuyForQuoteNotional(buyOb.asks, execNotionalUsd);
          if (buy && buy.baseFilled > 0) {
            const sell = vwapSellForBaseAmount(sellOb.bids, buy.baseFilled);
            if (sell && sell.quoteReceived > 0) {
              const grossSpreadPctDepth = ((sell.vwap - buy.vwap) / buy.vwap) * 100;
              netSpreadDepthPct = grossSpreadPctDepth - feePct - latencyPct;
              netProfitDepthUsd = (netSpreadDepthPct / 100) * execNotionalUsd;
              depth = {
                buyVwap: buy.vwap,
                sellVwap: sell.vwap,
                buySlippageBps: buy.slippageBps,
                sellSlippageBps: sell.slippageBps,
              };
            }
          }
        }
      }

      return {
        ...o,
        // Existing fields are “per $1000”; add “for your notional”.
        notionalUsd: effectiveNotionalUsd,
        execNotionalUsd: Math.round(execNotionalUsd * 100) / 100,
        grossProfitUsd: Math.round(grossProfitUsdTarget * 100) / 100,
        netProfitUsd: Math.round(netProfitUsdTarget * 100) / 100,
        grossProfitExecUsd: Math.round(((o.spreadPct / 100) * execNotionalUsd) * 100) / 100,
        netProfitExecUsd: Math.round((((netSpreadDepthPct ?? o.netSpreadPct) / 100) * execNotionalUsd) * 100) / 100,
        fee: {
          buyTaker,
          sellTaker,
          feePct,
          sourceBuy: venueFees?.[buyEx]?.source ?? "fallback",
          sourceSell: venueFees?.[sellEx]?.source ?? "fallback",
        },
        constraints: includeConstraints
          ? {
              buy: buyC ? { ok: buyC.ok, amountMin: buyC.amountMin, costMin: buyC.costMin, amountPrecision: buyC.amountPrecision } : null,
              sell: sellC ? { ok: sellC.ok, amountMin: sellC.amountMin, costMin: sellC.costMin, amountPrecision: sellC.amountPrecision } : null,
            }
          : null,
        depth,
        netSpreadDepthPct: netSpreadDepthPct !== null ? Math.round(netSpreadDepthPct * 10000) / 10000 : null,
        execution,
        readiness: (() => {
          const reasons = new Set<string>();
          if (!INTERNAL_SETTLEMENT_ENABLED && connectedVenues.length === 0) reasons.add("connect_exchange_api");
          if (execution?.status === "missing") {
            for (const b of execution.blockers ?? []) reasons.add(String(b));
          }
          if (execution?.status === "unknown") reasons.add("execution_data_unavailable");

          const netExecSpread = netSpreadDepthPct ?? o.netSpreadPct;
          const profitableNow = Number.isFinite(netExecSpread) && netExecSpread > 0;

          const windowSecs = clamp(envNumber("ARB_ACTION_WINDOW_SECS", 90), 15, 600);
          const windowBucket = Math.floor(Date.now() / 1000 / windowSecs);
          const baseChance = clamp(envNumber("ARB_ACTIONABLE_BASE_PCT", 18), 1, 95) / 100;
          const spreadBoost = Math.max(0, Math.min(0.45, (netExecSpread - 0.1) * 0.12));
          const openChance = Math.min(0.9, baseChance + spreadBoost);
          const windowRoll = hashUnit(`${actingUserId}:${o.symbol}:${buyEx}:${sellEx}:${windowBucket}`);
          const windowOpen = windowRoll < openChance;

          if (profitableNow && !windowOpen) reasons.add("execution_window_closed");

          const canExecute = INTERNAL_SETTLEMENT_ENABLED
            ? profitableNow && windowOpen && reasons.size === 0
            : execution?.status === "ready" && reasons.size === 0 && profitableNow;

          const state: "discoverable" | "action_required" | "executable" = canExecute
            ? "executable"
            : reasons.size > 0
              ? "action_required"
              : "discoverable";

          return {
            state,
            canExecute,
            reasons: Array.from(reasons),
          };
        })(),
      };
    }).filter((v): v is NonNullable<typeof v> => Boolean(v));

    // Price map for transparency.
    const priceMap: Record<string, Record<string, { bid: string; ask: string; ts: string }>> = {};
    for (const s of latest) {
      if (!priceMap[s.symbol]) priceMap[s.symbol] = {};
      priceMap[s.symbol]![s.exchange] = { bid: s.bid, ask: s.ask, ts: s.ts.toISOString() };
    }

    // Internal-vs-external index: compare internal base/USDT mid vs external index in USDT.
    const maxIndexBases = clamp(envNumber("ARB_INDEX_MAX_BASES", 12), 1, 50);
    const indexBases = prioritizedCap(enabledBases, (b) => basePriority(String(b)), maxIndexBases);

    const internal = await getInternalUsdtMarkets(sql, indexBases);

    const minDevPct = Math.max(0, envNumber("ARB_INDEX_MIN_DEV_PCT", 0.25));

    const indexOpps = await Promise.all(
      internal.map(async (m) => {
        try {
          const idx = await getExternalIndexUsdt(m.base);
          if (!idx || !Number.isFinite(idx.mid) || idx.mid <= 0) return null;
          const devPct = ((m.mid - idx.mid) / idx.mid) * 100;

          const direction = devPct >= minDevPct
            ? "sell_internal_buy_external"
            : devPct <= -minDevPct
              ? "buy_internal_sell_external"
              : "none";

          return {
            base: m.base,
            internalSymbol: m.symbol,
            internalBidUsdt: m.bid,
            internalAskUsdt: m.ask,
            internalMidUsdt: m.mid,
            externalIndexUsdt: idx.mid,
            indexSourcesUsed: idx.sourcesUsed,
            indexSources: (idx.sources || []).map((s) => ({
              exchange: s.exchange,
              mid: s.mid,
              ts: s.ts,
              error: s.error,
            })),
            dispersionBps: idx.dispersionBps,
            deviationPct: Math.round(devPct * 10000) / 10000,
            direction,
            ts: new Date().toISOString(),
          };
        } catch {
          return null;
        }
      }),
    );

    const index = indexOpps.filter((v): v is NonNullable<typeof v> => Boolean(v));

    return NextResponse.json({
      ts: new Date().toISOString(),
      action,
      venues: {
        connected: connectedVenues,
        scanned: scanVenues,
        mode: connectedVenues.length > 0 ? "connected" : "public",
      },
      gates: {
        api: {
          ok: connectedVenues.length > 0,
          connectedCount: connectedVenues.length,
        },
      },
      symbols: {
        enabledCount: enabledBases.length,
        scanned: trackedSymbols,
        scannedCount: trackedSymbols.length,
        maxSymbols,
      },
      sizing: {
        minUsd,
        notionalUsd,
        capUsd: maxUsdHardCap,
      },
      external: {
        banner: connectedVenues.length === 0
          ? { tone: "warning", code: "no_exchange_connections", message: externalErrors.find((e) => e.error === "no_exchange_connections")?.message ?? "Connect an exchange API" }
          : null,
        opportunities,
        prices: priceMap,
        balances: venueBalances,
        balancesIncluded: Boolean(venueBalances),
        fees: venueFees,
        depthIncluded: Boolean(depthMap),
        constraintsIncluded: Boolean(constraintsMap),
        errors: action === "scan" ? [...externalErrors, ...(scanErrors as any[])] : externalErrors,
      },
      index: {
        minDevPct,
        opportunities: index,
      },
    });
  } catch (e) {
    const resp = responseForDbError("exchange.arbitrage.overview", e);
    if (resp) return resp;
    console.error("[arb.overview] error", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
