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

async function binanceRequest(
  creds: ExchangeCredentials,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const baseUrl = process.env.BINANCE_API_URL || "https://api.binance.com";
  const timestamp = Date.now().toString();
  const allParams = { ...params, timestamp, recvWindow: "5000" };
  const qs = new URLSearchParams(allParams).toString();
  const signature = binanceSign(qs, creds.apiSecret);
  const url = `${baseUrl}${path}?${qs}&signature=${signature}`;

  const res = await fetch(url, {
    method,
    headers: { "X-MBX-APIKEY": creds.apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance ${res.status}: ${body}`);
  }
  return res.json();
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
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
  );
  if (!res.ok) throw new Error(`Binance ticker ${res.status}`);
  const d = (await res.json()) as Record<string, string>;
  return {
    symbol: d.symbol,
    bid: d.bidPrice,
    ask: d.askPrice,
    last: d.lastPrice,
    volume24h: d.volume,
    change24hPct: d.priceChangePercent,
    ts: Date.now(),
  };
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
  const baseUrl = "https://api.bybit.com";
  const timestamp = Date.now().toString();
  let url = `${baseUrl}${path}`;
  let body: string | undefined;

  if (method === "GET") {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    const sign = bybitSign(timestamp, creds.apiKey, qs, creds.apiSecret);
    if (qs) url += `?${qs}`;
    const res = await fetch(url, {
      method,
      headers: {
        "X-BAPI-API-KEY": creds.apiKey,
        "X-BAPI-SIGN": sign,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": "5000",
      },
    });
    if (!res.ok) throw new Error(`Bybit ${res.status}: ${await res.text()}`);
    return res.json();
  }

  body = JSON.stringify(params);
  const sign = bybitSign(timestamp, creds.apiKey, body, creds.apiSecret);
  const res = await fetch(url, {
    method,
    headers: {
      "X-BAPI-API-KEY": creds.apiKey,
      "X-BAPI-SIGN": sign,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": "5000",
      "Content-Type": "application/json",
    },
    body,
  });
  if (!res.ok) throw new Error(`Bybit ${res.status}: ${await res.text()}`);
  return res.json();
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
  const res = await fetch(
    `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`,
  );
  if (!res.ok) throw new Error(`Bybit ticker ${res.status}`);
  const data = (await res.json()) as { result: { list: Record<string, string>[] } };
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
