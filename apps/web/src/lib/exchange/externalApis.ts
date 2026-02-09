/**
 * External Exchange API Client Layer
 *
 * Unified interface for connecting to Binance, Bybit, OKX.
 * Handles authentication, balance queries, order placement,
 * and real-time price feeds.
 */
import { createHmac } from "node:crypto";

export type SupportedExchange = "binance" | "bybit" | "okx";

export type ExchangeCredentials = {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // OKX only
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

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

async function fetchJson(url: string, opts?: RequestInit & { timeoutMs?: number }): Promise<unknown> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const { timeoutMs: _t, ...rest } = opts ?? {};
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: t.signal,
      headers: {
        "User-Agent": "TradeSynapse/1.0 (+https://tradesynapsev2-production.up.railway.app)",
        ...(rest.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
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

  let lastErr: unknown;
  for (const base of baseCandidates) {
    try {
      const data = (await fetchJson(
        `${base.replace(/\/$/, "")}/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`,
        { timeoutMs: 8000 },
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
      throw new Error("OKX support coming soon");
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
    default:
      throw new Error(`Ticker not supported for: ${exchange}`);
  }
}
