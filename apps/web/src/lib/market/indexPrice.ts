import type { SupportedExchange } from "../exchange/externalApis";
import { getExchangeTicker } from "../exchange/externalApis";

export type ExternalIndexSource = {
  exchange: SupportedExchange;
  symbol: string; // normalized (e.g. BTCUSDT)
  bid: number | null;
  ask: number | null;
  last: number | null;
  mid: number | null;
  ts: number;
  error?: string;
};

export type ExternalIndexQuote = {
  base: string;
  quote: "USDT";
  symbol: string; // normalized (e.g. BTCUSDT)
  mid: number;
  sources: ExternalIndexSource[];
  sourcesUsed: number;
  dispersionBps: number | null;
  computedAt: Date;
  validUntil: Date;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parseNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function dispersionBpsFrom(values: number[], center: number): number | null {
  if (values.length < 3) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const p10 = sorted[Math.floor((sorted.length - 1) * 0.1)]!;
  const p90 = sorted[Math.floor((sorted.length - 1) * 0.9)]!;
  if (!Number.isFinite(center) || center <= 0) return null;
  return ((p90 - p10) / center) * 10_000;
}

function nowPlusMs(ms: number) {
  return new Date(Date.now() + ms);
}

function normalizeBase(base: string): string {
  return base.trim().toUpperCase();
}

function symbolBaseUsdt(base: string): string {
  return `${normalizeBase(base)}USDT`;
}

const DEFAULT_EXCHANGES: SupportedExchange[] = [
  "binance",
  "bybit",
  "okx",
  "kucoin",
  "gateio",
  "bitget",
  "mexc",
];

function parseExchangesEnv(): SupportedExchange[] {
  const raw = process.env.MARKETS_INDEX_EXCHANGES;
  if (!raw) return DEFAULT_EXCHANGES;
  const allow = new Set(DEFAULT_EXCHANGES);
  const parts = raw
    .split(/[\n,]/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((s) => allow.has(s as SupportedExchange)) as SupportedExchange[];

  const out: SupportedExchange[] = [];
  const seen = new Set<SupportedExchange>();
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }

  return out.length ? out : DEFAULT_EXCHANGES;
}

function ttlMs(): number {
  const raw = process.env.MARKETS_INDEX_TTL_MS;
  const v = raw ? Number(raw) : NaN;
  return clamp(Number.isFinite(v) ? v : 15_000, 2_000, 120_000);
}

function concurrencyLimit(): number {
  const raw = process.env.MARKETS_INDEX_CONCURRENCY;
  const v = raw ? Number(raw) : NaN;
  return clamp(Number.isFinite(v) ? v : 4, 1, 10);
}

function tickerTimeoutMs(): number {
  const raw = process.env.MARKETS_INDEX_TICKER_TIMEOUT_MS ?? process.env.CCXT_TICKER_TIMEOUT_MS;
  const v = raw ? Number(raw) : NaN;
  return clamp(Number.isFinite(v) ? v : 3500, 500, 20_000);
}

const cache = new Map<string, ExternalIndexQuote>();

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

export async function getExternalIndexUsdt(base: string): Promise<ExternalIndexQuote | null> {
  const baseSym = normalizeBase(base);
  if (!baseSym || baseSym === "USDT") return null;

  const symbol = symbolBaseUsdt(baseSym);
  const cached = cache.get(symbol);
  if (cached && cached.validUntil.getTime() > Date.now()) return cached;

  const exchanges = parseExchangesEnv();
  const sources: ExternalIndexSource[] = [];

  const timeout = tickerTimeoutMs();

  await runWithConcurrency(exchanges, concurrencyLimit(), async (exchange) => {
    try {
      const t = await Promise.race([
        getExchangeTicker(exchange, symbol),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error(`timeout:getExchangeTicker:${exchange}`)), timeout)
        ),
      ]);
      const bid = parseNum(t.bid);
      const ask = parseNum(t.ask);
      const last = parseNum(t.last);
      const mid = bid && ask ? (bid + ask) / 2 : last;
      sources.push({ exchange, symbol, bid, ask, last, mid, ts: t.ts });
    } catch (e) {
      sources.push({
        exchange,
        symbol,
        bid: null,
        ask: null,
        last: null,
        mid: null,
        ts: Date.now(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  const mids = sources.map((s) => s.mid).filter((m): m is number => typeof m === "number" && Number.isFinite(m) && m > 0);
  const mid = median(mids);
  if (!mid) return null;

  const computedAt = new Date();
  const quote: ExternalIndexQuote = {
    base: baseSym,
    quote: "USDT",
    symbol,
    mid,
    sources,
    sourcesUsed: mids.length,
    dispersionBps: dispersionBpsFrom(mids, mid),
    computedAt,
    validUntil: nowPlusMs(ttlMs()),
  };

  cache.set(symbol, quote);
  return quote;
}
