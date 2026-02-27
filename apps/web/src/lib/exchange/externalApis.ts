/**
 * External Exchange API Client Layer
 *
 * Unified interface for connecting to Binance, Bybit, OKX.
 * Handles authentication, balance queries, order placement,
 * and real-time price feeds.
 */
import { createHmac } from "node:crypto";
import ccxt from "ccxt";

export type CcxtExchange = {
  fetchTicker: (symbol: string) => Promise<any>;
  fetchTickers?: (symbols?: string[]) => Promise<any>;
  fetchOrderBook?: (symbol: string, limit?: number) => Promise<any>;
  fetchBalance: () => Promise<any>;
  fetchFundingRates?: () => Promise<any>;
  fetchTradingFee?: (symbol: string, params?: any) => Promise<any>;
  fetchTradingFees?: (params?: any) => Promise<any>;
  loadMarkets?: (reload?: boolean, params?: any) => Promise<any>;
  market?: (symbol: string) => any;
  markets?: Record<string, any>;
  amountToPrecision?: (symbol: string, amount: number) => string;
  priceToPrecision?: (symbol: string, price: number) => string;
  apiKey?: string;
  secret?: string;
  password?: string;
  options?: any;
};

export type SupportedExchange = "binance" | "bybit" | "okx" | "kucoin" | "gateio" | "bitget" | "mexc";

export type ExchangeCredentials = {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // OKX + KuCoin
};

export type ExchangeTicker = {
  symbol: string;
  bid: string;
  ask: string;
  last: string;
  volume24h: string;
  change24hPct: string;
  ts: number;
};

export type ExchangeOrderBook = {
  symbol: string;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  ts: number;
};

export type ExchangeTradingFee = {
  symbol: string;
  maker: number | null; // fraction (e.g. 0.001)
  taker: number | null; // fraction
  source: string;
  ts: number;
};

export type ExchangeMarketConstraints = {
  exchange: SupportedExchange;
  symbol: string;
  ok: boolean;
  amountMin: number | null;
  costMin: number | null;
  amountPrecision: number | null;
  pricePrecision: number | null;
  source: string;
  ts: number;
  error?: string;
};

type MarketsCacheEntry = {
  expiresAt: number;
  markets: Record<string, any> | null;
  pending: Promise<Record<string, any> | null> | null;
};

const MARKETS_CACHE = new Map<string, MarketsCacheEntry>();

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const v = raw ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

async function getCcxtMarketsCached(exchange: SupportedExchange): Promise<Record<string, any> | null> {
  const ttlMs = Math.max(10_000, envNumber("ARB_MARKETS_TTL_MS", 10 * 60 * 1000));
  const now = Date.now();
  const key = String(exchange);
  const existing = MARKETS_CACHE.get(key);
  if (existing && existing.markets && existing.expiresAt > now) return existing.markets;
  if (existing?.pending) return existing.pending;

  const ex = createCcxtPublic(exchange) as CcxtExchange;
  const loadMarkets = ex.loadMarkets;
  if (typeof loadMarkets !== "function") {
    MARKETS_CACHE.set(key, { expiresAt: now + ttlMs, markets: null, pending: null });
    return null;
  }

  const pending = (async () => {
    try {
      await loadMarkets.call(ex, false);
      const mkts = (ex as any).markets as Record<string, any> | undefined;
      const markets = mkts && typeof mkts === "object" ? mkts : null;
      MARKETS_CACHE.set(key, { expiresAt: now + ttlMs, markets, pending: null });
      return markets;
    } catch {
      MARKETS_CACHE.set(key, { expiresAt: now + Math.min(60_000, ttlMs), markets: null, pending: null });
      return null;
    }
  })();

  MARKETS_CACHE.set(key, { expiresAt: now + ttlMs, markets: existing?.markets ?? null, pending });
  return pending;
}

export async function getExchangeMarketConstraints(
  exchange: SupportedExchange,
  symbol: string,
): Promise<ExchangeMarketConstraints> {
  const s = toCcxtSymbol(symbol);
  try {
    const markets = await getCcxtMarketsCached(exchange);
    const m = markets?.[s] ?? null;
    if (!m) {
      return {
        exchange,
        symbol: symbol.toUpperCase(),
        ok: false,
        amountMin: null,
        costMin: null,
        amountPrecision: null,
        pricePrecision: null,
        source: "ccxt.loadMarkets",
        ts: Date.now(),
        error: "symbol_not_found",
      };
    }

    const amountMinRaw = m?.limits?.amount?.min;
    const costMinRaw = m?.limits?.cost?.min;
    const amountPrecisionRaw = m?.precision?.amount;
    const pricePrecisionRaw = m?.precision?.price;

    const amountMin = toSafeNumber(amountMinRaw);
    const costMin = toSafeNumber(costMinRaw);
    const amountPrecision = toSafeNumber(amountPrecisionRaw);
    const pricePrecision = toSafeNumber(pricePrecisionRaw);

    return {
      exchange,
      symbol: symbol.toUpperCase(),
      ok: true,
      amountMin,
      costMin,
      amountPrecision: amountPrecision !== null ? Math.max(0, Math.floor(amountPrecision)) : null,
      pricePrecision: pricePrecision !== null ? Math.max(0, Math.floor(pricePrecision)) : null,
      source: "ccxt.loadMarkets",
      ts: Date.now(),
    };
  } catch (e) {
    return {
      exchange,
      symbol: symbol.toUpperCase(),
      ok: false,
      amountMin: null,
      costMin: null,
      amountPrecision: null,
      pricePrecision: null,
      source: "ccxt.loadMarkets",
      ts: Date.now(),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  const name = typeof anyErr.name === "string" ? anyErr.name : "";
  const message = typeof anyErr.message === "string" ? anyErr.message : "";
  return name === "AbortError" || message.toLowerCase().includes("aborted");
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, String(v)]));
}

function bodyToString(body: RequestInit["body"]): string | null {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return null;
}

function toCcxtSymbol(symbol: string): string {
  // Our internal symbols tend to look like BTCUSDT. CCXT expects BTC/USDT.
  if (symbol.includes("/")) return symbol;
  const u = symbol.toUpperCase();
  const knownQuotes = ["USDT", "USDC", "USD", "BTC", "ETH", "BNB"];
  for (const q of knownQuotes) {
    if (u.endsWith(q) && u.length > q.length) {
      return `${u.slice(0, -q.length)}/${q}`;
    }
  }
  return symbol;
}

export function createCcxtPublic(exchangeId: string): CcxtExchange {
  const Ctor = (ccxt as any)[exchangeId];
  if (!Ctor) throw new Error(`Unsupported ccxt exchange: ${exchangeId}`);
  // Force swap/futures mode for funding rates if possible, though strict spot/swap separation depends on exchange
  // For generic use, we stick to default and let the caller specify arguments or rely on unified behavior.

  const rawTimeout = process.env.CCXT_TIMEOUT_MS ?? process.env.MARKETS_INDEX_TICKER_TIMEOUT_MS;
  const parsed = rawTimeout ? Number(rawTimeout) : Number.NaN;
  const timeoutMs = Number.isFinite(parsed) ? Math.min(20_000, Math.max(500, Math.trunc(parsed))) : 5000;

  return new Ctor({ enableRateLimit: true, timeout: timeoutMs });
}

function toSafeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function normalizeL2(levels: unknown): Array<[number, number]> {
  if (!Array.isArray(levels)) return [];
  const out: Array<[number, number]> = [];
  for (const lvl of levels) {
    if (!Array.isArray(lvl) || lvl.length < 2) continue;
    const p = toSafeNumber(lvl[0]);
    const a = toSafeNumber(lvl[1]);
    if (!p || !a || p <= 0 || a <= 0) continue;
    out.push([p, a]);
  }
  return out;
}

export async function getExchangeOrderBook(
  exchange: SupportedExchange,
  symbol: string,
  opts?: { limit?: number },
): Promise<ExchangeOrderBook> {
  const ex = createCcxtPublic(exchange);
  if (typeof ex.fetchOrderBook !== "function") {
    throw new Error(`${exchange} does not support fetchOrderBook`);
  }
  const s = toCcxtSymbol(symbol);
  const ob = await ex.fetchOrderBook(s, opts?.limit ?? 50);
  const bids = normalizeL2(ob?.bids);
  const asks = normalizeL2(ob?.asks);
  return {
    symbol: symbol.toUpperCase(),
    bids,
    asks,
    ts: Date.now(),
  };
}

export async function getAuthenticatedTradingFee(
  exchange: SupportedExchange,
  creds: ExchangeCredentials,
  symbol: string,
): Promise<ExchangeTradingFee> {
  const ex = createCcxtAuthed(exchange, creds);
  const s = toCcxtSymbol(symbol);

  // Try symbol-specific fee first.
  if (typeof ex.fetchTradingFee === "function") {
    const fee = await ex.fetchTradingFee(s);
    const maker = toSafeNumber(fee?.maker);
    const taker = toSafeNumber(fee?.taker);
    return {
      symbol: symbol.toUpperCase(),
      maker: maker ?? null,
      taker: taker ?? null,
      source: "ccxt.fetchTradingFee",
      ts: Date.now(),
    };
  }

  // Fall back to all-fees if available.
  if (typeof ex.fetchTradingFees === "function") {
    const all = await ex.fetchTradingFees();
    const entry = all?.[s] ?? all?.[symbol.toUpperCase()] ?? null;
    const maker = toSafeNumber(entry?.maker);
    const taker = toSafeNumber(entry?.taker);
    return {
      symbol: symbol.toUpperCase(),
      maker: maker ?? null,
      taker: taker ?? null,
      source: "ccxt.fetchTradingFees",
      ts: Date.now(),
    };
  }

  return {
    symbol: symbol.toUpperCase(),
    maker: null,
    taker: null,
    source: "unavailable",
    ts: Date.now(),
  };
}

export type FundingRate = {
  symbol: string;
  exchange: string;
  fundingRate: number;
  fundingTimestamp: number;
  nextFundingRate?: number;
  nextFundingTimestamp?: number;
  volume24h?: number; // New field for volume filtering
};

export async function getExchangeFundingRates(exchangeId: string): Promise<FundingRate[]> {
  const ex = createCcxtPublic(exchangeId);
  // Ensure we are looking at swap markets for funding
  const swapDefaultType = new Set(["binance", "bybit", "okx", "gateio", "bitget", "mexc"]);
  if (swapDefaultType.has(exchangeId)) {
    ex.options = { ...ex.options, defaultType: "swap" };
  }

  // Some exchanges don't support fetchFundingRates for ALL symbols at once,
  // but Binance/Bybit do.
  if (typeof ex.fetchFundingRates !== 'function') {
     throw new Error(`${exchangeId} does not support fetchFundingRates`);
  }

  const rates: Record<string, any> = await ex.fetchFundingRates();
  
  // Optionally enrich with volume data if fetchTickers is supported (efficiently)
  let volumes: Record<string, number> = {};
  if (typeof ex.fetchTickers === 'function') {
      try {
          const tickers = await ex.fetchTickers();
          Object.values(tickers).forEach((t: any) => {
              volumes[t.symbol] = t.quoteVolume || t.baseVolume || 0;
          });
      } catch (e) {
          console.warn(`Failed to fetch tickers for volume data on ${exchangeId}`, e);
      }
  }

  const H8_MS = 8 * 60 * 60 * 1000;
  return Object.values(rates)
    .map((r: any) => {
      const fundingRate = Number(r?.fundingRate);
      const fundingTimestamp = Number(r?.fundingTimestamp);
      const nextFundingTimestampRaw = r?.nextFundingTimestamp;
      const nextFundingTimestamp = Number(nextFundingTimestampRaw);

      const fundingTsOk = Number.isFinite(fundingTimestamp) && fundingTimestamp > 0;
      const nextTsOk = Number.isFinite(nextFundingTimestamp) && nextFundingTimestamp > 0;
      const safeFundingTimestamp = fundingTsOk ? fundingTimestamp : Date.now();
      const safeNextFundingTimestamp = nextTsOk
        ? nextFundingTimestamp
        : safeFundingTimestamp + H8_MS;

      return {
        symbol: String(r?.symbol ?? ""), // CCXT symbol (e.g. BTC/USDT:USDT)
        exchange: exchangeId,
        fundingRate: Number.isFinite(fundingRate) ? fundingRate : 0,
        fundingTimestamp: safeFundingTimestamp,
        nextFundingRate: typeof r?.nextFundingRate === "number" ? r.nextFundingRate : undefined,
        nextFundingTimestamp: safeNextFundingTimestamp,
        volume24h: volumes[String(r?.symbol ?? "")] || 0,
      } as FundingRate;
    })
    .filter((r) => !!r.symbol);
}

function createCcxtAuthed(exchangeId: string, creds: ExchangeCredentials): CcxtExchange {
  const ex = createCcxtPublic(exchangeId);
  (ex as any).apiKey = creds.apiKey;
  (ex as any).secret = creds.apiSecret;
  // OKX + KuCoin use 'password' in CCXT
  if (creds.passphrase) (ex as any).password = creds.passphrase;
  return ex;
}

export function getAuthenticatedExchangeClient(exchangeId: string, creds: ExchangeCredentials): CcxtExchange {
  return createCcxtAuthed(exchangeId, creds);
}

export function getAuthenticatedExchangeClientWithType(
  exchangeId: string,
  creds: ExchangeCredentials,
  opts: { defaultType: "spot" | "swap" },
): CcxtExchange {
  const ex = createCcxtAuthed(exchangeId, creds);
  ex.options = { ...ex.options, defaultType: opts.defaultType };
  return ex;
}

async function ccxtGetTicker(exchangeId: string, symbol: string): Promise<ExchangeTicker> {
  const ex = createCcxtPublic(exchangeId);
  const s = toCcxtSymbol(symbol);

  const rawTimeout = process.env.CCXT_TICKER_TIMEOUT_MS ?? process.env.CCXT_TIMEOUT_MS ?? "5000";
  const parsed = Number(rawTimeout);
  const timeoutMs = Number.isFinite(parsed) ? Math.min(20_000, Math.max(500, Math.trunc(parsed))) : 5000;

  // CCXT has its own HTTP timeout, but some transports can still hang; enforce an upper bound.
  const t = await Promise.race([
    ex.fetchTicker(s),
    new Promise<any>((_resolve, reject) => setTimeout(() => reject(new Error("timeout:ccxtGetTicker")), timeoutMs)),
  ]);
  const bid = t.bid ?? 0;
  const ask = t.ask ?? 0;
  const last = t.last ?? 0;
  const volume = (t.quoteVolume ?? t.baseVolume ?? 0) as number;
  const pct = (t.percentage ?? 0) as number;

  return {
    symbol: symbol.toUpperCase(),
    bid: String(bid || 0),
    ask: String(ask || 0),
    last: String(last || 0),
    volume24h: String(volume || 0),
    change24hPct: String(pct || 0),
    ts: Date.now(),
  };
}

async function ccxtGetBalances(exchangeId: string, creds: ExchangeCredentials): Promise<ExchangeBalance[]> {
  const ex = createCcxtAuthed(exchangeId, creds);
  const b = await ex.fetchBalance();
  const out: ExchangeBalance[] = [];
  for (const [asset, total] of Object.entries(b.total ?? {})) {
    const t = typeof total === "number" ? total : Number(total);
    if (!Number.isFinite(t) || t <= 0) continue;
    const free = Number((b.free as any)?.[asset] ?? 0);
    const used = Number((b.used as any)?.[asset] ?? Math.max(0, t - free));
    out.push({ asset, free: String(free), locked: String(used) });
  }
  return out;
}

async function fetchJson(url: string, opts?: RequestInit & { timeoutMs?: number }): Promise<unknown> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const { timeoutMs: _t, ...rest } = opts ?? {};
  const t = withTimeout(timeoutMs);
  try {
    const doFetch = async (targetUrl: string) => {
      const extraHeaders = headersToRecord(rest.headers);
      const res = await fetch(targetUrl, {
        ...rest,
        signal: t.signal,
        headers: {
          "User-Agent": "TradeSynapse/1.0 (+https://tradesynapsev2-production.up.railway.app)",
          ...extraHeaders,
        },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
      return text;
    };

    try {
      const text = await doFetch(url);
      return text ? JSON.parse(text) : null;
    } catch (e) {
      // Optional relay fallback for geo-blocked environments.
      const relayUrl = process.env.EXCHANGE_RELAY_URL;
      const relayKey = process.env.EXCHANGE_RELAY_KEY;
      if (!relayUrl) throw e;

      // If the direct request already timed out, the relay retry must be
      // strictly bounded or we can exceed platform request limits.
      const relayBudgetMs = isAbortError(e) ? Math.min(1500, timeoutMs) : timeoutMs;
      if (relayBudgetMs < 250) throw e;

      const relayEndpoint = `${relayUrl.replace(/\/$/, "")}/fetch`;
      const relayTimeout = withTimeout(relayBudgetMs);
      try {
        const relayForwardHeaders = headersToRecord(rest.headers);
        const res = await fetch(relayEndpoint, {
          method: "POST",
          signal: relayTimeout.signal,
          headers: {
            "content-type": "application/json",
            ...(relayKey ? { "x-relay-key": relayKey } : {}),
          },
          body: JSON.stringify({
            url,
            method: rest.method ?? "GET",
            headers: relayForwardHeaders,
            body: bodyToString(rest.body),
          }),
        });

        const payloadText = await res.text();
        if (!res.ok) throw new Error(`Relay ${res.status}: ${payloadText}`);
        const payload = payloadText ? (JSON.parse(payloadText) as { status: number; body: string }) : null;
        if (!payload) return null;
        if (payload.status < 200 || payload.status >= 300) {
          throw new Error(`HTTP ${payload.status}: ${payload.body}`);
        }
        return payload.body ? JSON.parse(payload.body) : null;
      } finally {
        relayTimeout.clear();
      }
    }
  } finally {
    t.clear();
  }
}

export type ExchangeBalance = {
  asset: string;
  free: string;
  locked: string;
};

export type ExchangeOrderResult = {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  price: string;
  quantity: string;
  status: string;
};

// ── Binance Spot API ─────────────────────────────────────────────────

function binanceSign(queryString: string, secret: string): string {
  return createHmac("sha256", secret).update(queryString).digest("hex");
}

function uniqStrings(list: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const v of list) {
    if (!v) continue;
    const s = v.trim();
    if (!s) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

async function binanceRequest(
  creds: ExchangeCredentials,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const baseCandidates = uniqStrings([
    process.env.BINANCE_API_URL,
    process.env.BINANCE_PUBLIC_API_URL,
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
  ]);
  const timestamp = Date.now().toString();
  const allParams = { ...params, timestamp, recvWindow: "5000" };
  const qs = new URLSearchParams(allParams).toString();
  const signature = binanceSign(qs, creds.apiSecret);

  let lastErr: unknown;
  for (const baseUrl of baseCandidates) {
    const url = `${baseUrl.replace(/\/$/, "")}${path}?${qs}&signature=${signature}`;
    try {
      return await fetchJson(url, {
        method,
        timeoutMs: 10_000,
        headers: { "X-MBX-APIKEY": creds.apiKey },
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Binance request failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

export async function binanceGetBalances(creds: ExchangeCredentials): Promise<ExchangeBalance[]> {
  const data = (await binanceRequest(creds, "GET", "/api/v3/account")) as {
    balances: { asset: string; free: string; locked: string }[];
  };
  return data.balances
    .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map((b) => ({ asset: b.asset, free: b.free, locked: b.locked }));
}

export async function binanceGetTicker(symbol: string): Promise<ExchangeTicker> {
  // Some hosts have intermittent connectivity to api.binance.com; try fallbacks.
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
    try {
      const url = `${base.replace(/\/$/, "")}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
      const d = (await fetchJson(url, { timeoutMs: 8000 })) as Record<string, string>;
      return {
        symbol: d.symbol,
        bid: d.bidPrice,
        ask: d.askPrice,
        last: d.lastPrice,
        volume24h: d.volume,
        change24hPct: d.priceChangePercent,
        ts: Date.now(),
      };
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  // Binance "vision" endpoints mirror public market data and sometimes remain
  // accessible when the primary API is geo-restricted.
  const visionBases = [
    "https://data-api.binance.vision",
    "https://api.binance.vision",
  ];

  for (const base of visionBases) {
    try {
      const url = `${base}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`;
      const d = (await fetchJson(url, { timeoutMs: 8000 })) as Record<string, string>;
      return {
        symbol: d.symbol ?? symbol,
        bid: d.bidPrice,
        ask: d.askPrice,
        last: d.askPrice,
        volume24h: "0",
        change24hPct: "0",
        ts: Date.now(),
      };
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(`Binance ticker failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

export async function binancePlaceOrder(
  creds: ExchangeCredentials,
  opts: { symbol: string; side: "BUY" | "SELL"; type: "LIMIT" | "MARKET"; price?: string; quantity: string; timeInForce?: string },
): Promise<ExchangeOrderResult> {
  const params: Record<string, string> = {
    symbol: opts.symbol,
    side: opts.side,
    type: opts.type,
    quantity: opts.quantity,
  };
  if (opts.price) params.price = opts.price;
  if (opts.type === "LIMIT") params.timeInForce = opts.timeInForce ?? "GTC";

  const data = (await binanceRequest(creds, "POST", "/api/v3/order", params)) as Record<string, unknown>;
  return {
    orderId: String(data.orderId),
    symbol: String(data.symbol),
    side: (String(data.side).toLowerCase()) as "buy" | "sell",
    type: String(data.type),
    price: String(data.price ?? "0"),
    quantity: String(data.origQty ?? opts.quantity),
    status: String(data.status),
  };
}

// ── Bybit Spot API v5 ───────────────────────────────────────────────

function bybitSign(timestamp: string, apiKey: string, params: string, secret: string): string {
  const payload = `${timestamp}${apiKey}5000${params}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

async function bybitRequest(
  creds: ExchangeCredentials,
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const baseCandidates = uniqStrings([
    process.env.BYBIT_API_URL,
    process.env.BYBIT_PUBLIC_API_URL,
    "https://api.bybit.com",
    // Alternate domain used in some regions
    "https://api.bytick.com",
  ]);
  const timestamp = Date.now().toString();
  let url = "";
  let body: string | undefined;

  if (method === "GET") {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    const sign = bybitSign(timestamp, creds.apiKey, qs, creds.apiSecret);
    const headers = {
      "X-BAPI-API-KEY": creds.apiKey,
      "X-BAPI-SIGN": sign,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": "5000",
    };

    let lastErr: unknown;
    for (const baseUrl of baseCandidates) {
      url = `${baseUrl.replace(/\/$/, "")}${path}`;
      if (qs) url += `?${qs}`;
      try {
        return await fetchJson(url, { method, headers, timeoutMs: 10_000 });
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`Bybit request failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }

  body = JSON.stringify(params);
  const sign = bybitSign(timestamp, creds.apiKey, body, creds.apiSecret);
  const headers = {
    "X-BAPI-API-KEY": creds.apiKey,
    "X-BAPI-SIGN": sign,
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-RECV-WINDOW": "5000",
    "Content-Type": "application/json",
  };

  let lastErr: unknown;
  for (const baseUrl of baseCandidates) {
    url = `${baseUrl.replace(/\/$/, "")}${path}`;
    try {
      return await fetchJson(url, { method, headers, body, timeoutMs: 10_000 });
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Bybit request failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

export async function bybitGetBalances(creds: ExchangeCredentials): Promise<ExchangeBalance[]> {
  const data = (await bybitRequest(creds, "GET", "/v5/account/wallet-balance", {
    accountType: "UNIFIED",
  })) as { result: { list: { coin: { coin: string; walletBalance: string; locked: string }[] }[] } };

  const coins = data.result?.list?.[0]?.coin ?? [];
  return coins
    .filter((c) => parseFloat(c.walletBalance) > 0)
    .map((c) => ({
      asset: c.coin,
      free: String(parseFloat(c.walletBalance) - parseFloat(c.locked || "0")),
      locked: c.locked || "0",
    }));
}

export async function bybitGetTicker(symbol: string): Promise<ExchangeTicker> {
  const baseCandidates = uniqStrings([
    process.env.BYBIT_PUBLIC_API_URL,
    process.env.BYBIT_API_URL,
    "https://api.bybit.com",
    "https://api.bytick.com",
    "https://api2.bybit.com",
  ]);

  const timeoutMs = (() => {
    const raw = process.env.BYBIT_TICKER_TIMEOUT_MS;
    const v = raw ? Number(raw) : NaN;
    // Default to a more forgiving timeout if unset, but allow envs to reduce it.
    if (!Number.isFinite(v) || v <= 0) return 8_000;
    return Math.max(2_000, v);
  })();

  const headers = {
    accept: "application/json",
    "user-agent": "TradeSynapse/1.0 (+https://tradesynapse.app)",
  };

  const startedAt = Date.now();
  let lastErr: unknown;
  for (const base of baseCandidates) {
    const elapsed = Date.now() - startedAt;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) break;
    const attemptTimeoutMs = Math.min(5_000, remaining);
    try {
      const data = (await fetchJson(
        `${base.replace(/\/$/, "")}/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`,
        { timeoutMs: attemptTimeoutMs, headers },
      )) as { result: { list: Record<string, string>[] } };
      const d = data.result.list[0];
      if (!d) throw new Error("Bybit ticker not found");
      return {
        symbol: d.symbol,
        bid: d.bid1Price,
        ask: d.ask1Price,
        last: d.lastPrice,
        volume24h: d.volume24h,
        change24hPct: d.price24hPcnt ? String(parseFloat(d.price24hPcnt) * 100) : "0",
        ts: Date.now(),
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Bybit ticker failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}


export async function bybitPlaceOrder(
  creds: ExchangeCredentials,
  opts: { symbol: string; side: "Buy" | "Sell"; type: "Limit" | "Market"; price?: string; quantity: string },
): Promise<ExchangeOrderResult> {
  const params: Record<string, unknown> = {
    category: "spot",
    symbol: opts.symbol,
    side: opts.side,
    orderType: opts.type,
    qty: opts.quantity,
  };
  if (opts.price) params.price = opts.price;

  const data = (await bybitRequest(creds, "POST", "/v5/order/create", params)) as { result: { orderId: string, orderLinkId: string } };
  return {
    orderId: data.result.orderId,
    symbol: opts.symbol,
    side: opts.side.toLowerCase() as "buy" | "sell",
    type: opts.type.toUpperCase(),
    price: opts.price || "0",
    quantity: opts.quantity,
    status: "new",
  };
}

// ── Unified interface ────────────────────────────────────────────────

export async function placeExchangeOrder(
  exchange: SupportedExchange,
  creds: ExchangeCredentials,
  opts: { symbol: string; side: "buy" | "sell"; type: "limit" | "market"; price?: string; quantity: string }
): Promise<ExchangeOrderResult> {
    const side = opts.side === "buy" ? "BUY" : "SELL"; // Standardize for Binance
    const bybitSide = opts.side === "buy" ? "Buy" : "Sell"; // Standardize for Bybit
    const type = opts.type === "limit" ? "LIMIT" : "MARKET";
    const bybitType = opts.type === "limit" ? "Limit" : "Market";

    switch (exchange) {
        case "binance":
            return binancePlaceOrder(creds, {
                ...opts,
                side: side as "BUY" | "SELL",
                type: type as "LIMIT" | "MARKET"
            });
        case "bybit":
            return bybitPlaceOrder(creds, {
                symbol: opts.symbol,
                side: bybitSide,
                type: bybitType,
                price: opts.price,
                quantity: opts.quantity
            });
        case "okx":
             throw new Error("OKX trading not yet supported");
        default:
             throw new Error(`Trading not supported for: ${exchange}`);
    }
}

export async function getExchangeBalances(
  exchange: SupportedExchange,
  creds: ExchangeCredentials,
): Promise<ExchangeBalance[]> {
  switch (exchange) {
    case "binance":
      return binanceGetBalances(creds);
    case "bybit":
      return bybitGetBalances(creds);
    case "okx":
      return ccxtGetBalances("okx", creds);
    case "kucoin":
      return ccxtGetBalances("kucoin", creds);
    case "gateio":
      return ccxtGetBalances("gateio", creds);
    case "bitget":
      return ccxtGetBalances("bitget", creds);
    case "mexc":
      return ccxtGetBalances("mexc", creds);
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}

export async function getExchangeTicker(
  exchange: SupportedExchange | "tradesynapse",
  symbol: string,
): Promise<ExchangeTicker> {
  switch (exchange) {
    case "binance":
      return binanceGetTicker(symbol);
    case "bybit":
      return bybitGetTicker(symbol);
    case "okx":
      return ccxtGetTicker("okx", symbol);
    case "kucoin":
      return ccxtGetTicker("kucoin", symbol);
    case "gateio":
      return ccxtGetTicker("gateio", symbol);
    case "bitget":
      return ccxtGetTicker("bitget", symbol);
    case "mexc":
      return ccxtGetTicker("mexc", symbol);
    default:
      throw new Error(`Ticker not supported for: ${exchange}`);
  }
}
