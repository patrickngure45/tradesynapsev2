"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { v2ButtonClassName, V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { V2Tabs } from "@/components/v2/Tabs";

type Pair = { base: string; quote: string };

type MarketOverviewRow = {
  id: string;
  symbol: string;
  is_halted: boolean;
  base_symbol: string;
  quote_symbol: string;
  stats: null | {
    open: string;
    last: string;
    high?: string | null;
    low?: string | null;
    volume?: string | null;
    quote_volume: string;
    trade_count?: number;
  };
};

type MarketsOverviewResponse = {
  markets: MarketOverviewRow[];
};

type DepthResponse = {
  depth: {
    bids: Array<{ price: string; quantity: string; order_count: number }>;
    asks: Array<{ price: string; quantity: string; order_count: number }>;
  };
  ts: string;
};

type TradesResponse = {
  trades: Array<{ id: string; price: string; quantity: string; created_at: string }>;
};

type CandlesResponse = {
  market: { id: string; chain: string; symbol: string; status: string };
  interval: "1m";
  candles: Array<{ ts: string; open: string; high: string; low: string; close: string; volume: string; trade_count: number }>;
};

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

function pctChange(open: string | null | undefined, last: string | null | undefined): number | null {
  const o = toNum(open);
  const l = toNum(last);
  if (o == null || l == null) return null;
  if (o <= 0) return null;
  return ((l - o) / o) * 100;
}

function fmtPrice(v: string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

const defaultPair: Pair = { base: "BTC", quote: "USDT" };

export function TradeClient() {
  const sp = useSearchParams();
  const initial = (() => {
    const base = String(sp?.get("base") ?? "").trim().toUpperCase();
    const quote = String(sp?.get("quote") ?? "").trim().toUpperCase();
    if (base && quote) return { base, quote } as Pair;
    return defaultPair;
  })();

  const [pair, setPair] = useState<Pair>(initial);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [segment, setSegment] = useState<"chart" | "book" | "trades">("chart");
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketOverviewRow[]>([]);
  const [pairSearch, setPairSearch] = useState("");

  const [depthLoading, setDepthLoading] = useState(false);
  const [depthError, setDepthError] = useState<string | null>(null);
  const [depth, setDepth] = useState<DepthResponse | null>(null);

  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [trades, setTrades] = useState<TradesResponse | null>(null);

  const [candleRange, setCandleRange] = useState<"1h" | "6h" | "8h">("1h");
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandlesResponse | null>(null);

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop_limit" | "oco" | "trailing_stop">("market");
  const [quantity, setQuantity] = useState<string>("");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [stopTriggerPrice, setStopTriggerPrice] = useState<string>("");
  const [ocoTakeProfitPrice, setOcoTakeProfitPrice] = useState<string>("");
  const [ocoStopTriggerPrice, setOcoStopTriggerPrice] = useState<string>("");
  const [ocoStopLimitPrice, setOcoStopLimitPrice] = useState<string>("");
  const [trailActivationPrice, setTrailActivationPrice] = useState<string>("");
  const [trailBps, setTrailBps] = useState<string>("50");
  const [placeStatus, setPlaceStatus] = useState<{ kind: "idle" | "placing" | "ok" | "error"; message?: string }>(
    { kind: "idle" },
  );

  const lastPlacedAtRef = useRef<number>(0);
  const esRef = useRef<EventSource | null>(null);

  const pairLabel = `${pair.base}/${pair.quote}`;

  // Remember last traded pair for default launch behavior (/v2).
  useEffect(() => {
    try {
      localStorage.setItem("cw:v2:lastPair", JSON.stringify({ base: pair.base, quote: pair.quote }));
    } catch {
      // ignore storage errors
    }
  }, [pair.base, pair.quote]);

  // If the user navigates from Markets with a new pair, keep state in sync.
  useEffect(() => {
    const base = String(sp?.get("base") ?? "").trim().toUpperCase();
    const quote = String(sp?.get("quote") ?? "").trim().toUpperCase();
    if (!base || !quote) return;
    if (base === pair.base && quote === pair.quote) return;
    setPair({ base, quote });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setMarketError(null);
      try {
        const res = await fetch("/api/exchange/markets/overview?fiat=USD", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as MarketsOverviewResponse | null;
        if (!res.ok) throw new Error("markets_unavailable");
        const rows = Array.isArray(json?.markets) ? json!.markets : [];
        const usdt = rows.filter((m) => String(m.quote_symbol).toUpperCase() === "USDT");
        if (!cancelled) setMarkets(usdt);
      } catch (e) {
        if (!cancelled) setMarketError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setMarketLoading(false);
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const market = useMemo(() => {
    const base = pair.base.toUpperCase();
    const quote = pair.quote.toUpperCase();
    return markets.find((m) => String(m.base_symbol).toUpperCase() === base && String(m.quote_symbol).toUpperCase() === quote) ?? null;
  }, [markets, pair.base, pair.quote]);

  const marketId = market?.id ?? null;

  const last = market?.stats?.last ?? null;
  const change = pctChange(market?.stats?.open ?? null, market?.stats?.last ?? null);
  const changeText = change == null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
  const changeClass = change == null ? "text-[var(--v2-muted)]" : change >= 0 ? "text-[var(--v2-up)]" : "text-[var(--v2-down)]";

  const high24h = market?.stats && (market.stats as any).high ? String((market.stats as any).high) : null;
  const low24h = market?.stats && (market.stats as any).low ? String((market.stats as any).low) : null;
  const volQuote = market?.stats?.quote_volume ?? null;

  const tabs = useMemo(
    () => [
      { id: "chart", label: "Chart" },
      { id: "book", label: "Book" },
      { id: "trades", label: "Trades" },
    ],
    [],
  );

  const loadDepth = async (id: string, signal?: AbortSignal) => {
    setDepthError(null);
    setDepthLoading(true);
    try {
      const res = await fetch(`/api/exchange/marketdata/depth?market_id=${encodeURIComponent(id)}&levels=12`, {
        cache: "no-store",
        signal,
      });
      const json = (await res.json().catch(() => null)) as DepthResponse | null;
      if (!res.ok) throw new Error("depth_unavailable");
      setDepth(json);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setDepthError(e instanceof Error ? e.message : String(e));
    } finally {
      setDepthLoading(false);
    }
  };

  const loadTrades = async (id: string, signal?: AbortSignal) => {
    setTradesError(null);
    setTradesLoading(true);
    try {
      const res = await fetch(`/api/exchange/marketdata/trades?market_id=${encodeURIComponent(id)}&limit=30`, {
        cache: "no-store",
        signal,
      });
      const json = (await res.json().catch(() => null)) as TradesResponse | null;
      if (!res.ok) throw new Error("trades_unavailable");
      setTrades(json);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setTradesError(e instanceof Error ? e.message : String(e));
    } finally {
      setTradesLoading(false);
    }
  };

  const loadCandles = async (id: string, limit: number, signal?: AbortSignal) => {
    setCandlesError(null);
    setCandlesLoading(true);
    try {
      const res = await fetch(
        `/api/exchange/marketdata/candles?market_id=${encodeURIComponent(id)}&interval=1m&limit=${encodeURIComponent(String(limit))}`,
        { cache: "no-store", signal },
      );
      const json = (await res.json().catch(() => null)) as CandlesResponse | null;
      if (!res.ok) throw new Error("candles_unavailable");
      setCandles(json);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setCandlesError(e instanceof Error ? e.message : String(e));
    } finally {
      setCandlesLoading(false);
    }
  };

  // Live updates: prefer SSE stream; fall back to fetch polling.
  useEffect(() => {
    if (!marketId) return;
    const controller = new AbortController();
    let interval: number | null = null;
    let retryTimeout: number | null = null;

    const stopSse = () => {
      try {
        esRef.current?.close();
      } catch {
        // ignore
      }
      esRef.current = null;
    };

    const stopPolling = () => {
      if (!interval) return;
      window.clearInterval(interval);
      interval = null;
    };

    const stopRetry = () => {
      if (!retryTimeout) return;
      window.clearTimeout(retryTimeout);
      retryTimeout = null;
    };

    const visible = () => document.visibilityState === "visible";

    const startFallbackPolling = () => {
      if (segment === "book") {
        if (visible()) void loadDepth(marketId, controller.signal);
        interval = window.setInterval(() => {
          if (!visible()) return;
          void loadDepth(marketId, controller.signal);
        }, 2200);
      } else if (segment === "trades") {
        if (visible()) void loadTrades(marketId, controller.signal);
        interval = window.setInterval(() => {
          if (!visible()) return;
          void loadTrades(marketId, controller.signal);
        }, 2800);
      }
    };

    const scheduleSseRetry = (delayMs: number) => {
      if (!visible()) return;
      if (segment !== "book" && segment !== "trades") return;
      if (typeof EventSource === "undefined") return;
      if (esRef.current) return;
      if (retryTimeout) return;

      retryTimeout = window.setTimeout(() => {
        retryTimeout = null;
        if (!visible()) return;
        if (segment === "book") startBookSse();
        else if (segment === "trades") startTradesSse();
      }, delayMs);
    };

    const ensureFallbackPolling = () => {
      if (!visible()) return;
      if (interval) return;
      startFallbackPolling();
    };

    const startBookSse = () => {
      if (!visible()) return;
      stopSse();
      stopRetry();
      stopPolling();
      setDepthError(null);
      setDepthLoading(true);
      try {
        const url = `/api/exchange/marketdata/stream?market_id=${encodeURIComponent(marketId)}&topics=depth&levels=12&poll_ms=1000&heartbeat_ms=15000`;
        const es = new EventSource(url);
        es.addEventListener("depth", (evt) => {
          try {
            const data = JSON.parse(String((evt as MessageEvent).data ?? "{}"));
            setDepth(data as any);
          } catch {
            // ignore
          } finally {
            setDepthLoading(false);
          }
        });
        es.onerror = () => {
          // Keep UI usable: stop SSE, fall back to polling.
          stopSse();
          setDepthLoading(false);
          ensureFallbackPolling();
          scheduleSseRetry(4500);
        };
        esRef.current = es;
      } catch {
        stopSse();
        setDepthLoading(false);
        ensureFallbackPolling();
        scheduleSseRetry(4500);
      }
    };

    const startTradesSse = () => {
      if (!visible()) return;
      stopSse();
      stopRetry();
      stopPolling();
      setTradesError(null);
      setTradesLoading(true);
      try {
        const url = `/api/exchange/marketdata/stream?market_id=${encodeURIComponent(marketId)}&topics=trades&trades_limit=30&trades_delta=1&poll_ms=1200&heartbeat_ms=15000`;
        const es = new EventSource(url);
        es.addEventListener("trades", (evt) => {
          try {
            const data = JSON.parse(String((evt as MessageEvent).data ?? "{}")) as any;
            const incoming = Array.isArray(data?.trades) ? data.trades : [];
            const mode = String(data?.mode ?? "snapshot");
            if (mode === "delta") {
              setTrades((prev) => {
                const prevRows = prev?.trades ?? [];
                const combined = [...incoming, ...prevRows];
                const seen = new Set<string>();
                const out = [] as any[];
                for (const t of combined) {
                  const id = String(t?.id ?? "");
                  if (!id || seen.has(id)) continue;
                  seen.add(id);
                  out.push(t);
                  if (out.length >= 30) break;
                }
                return { trades: out } as any;
              });
            } else {
              setTrades({ trades: incoming } as any);
            }
          } catch {
            // ignore
          } finally {
            setTradesLoading(false);
          }
        });
        es.onerror = () => {
          stopSse();
          setTradesLoading(false);
          ensureFallbackPolling();
          scheduleSseRetry(4500);
        };
        esRef.current = es;
      } catch {
        stopSse();
        setTradesLoading(false);
        ensureFallbackPolling();
        scheduleSseRetry(4500);
      }
    };

    const startChartPolling = () => {
      const limit = candleRange === "6h" ? 360 : candleRange === "8h" ? 500 : 60;
      if (visible()) void loadCandles(marketId, limit, controller.signal);
      interval = window.setInterval(() => {
        if (!visible()) return;
        void loadCandles(marketId, limit, controller.signal);
      }, 15_000);
    };

    const connect = () => {
      if (!visible()) return;
      if (segment === "book") {
        if (typeof EventSource !== "undefined") startBookSse();
        else startFallbackPolling();
      } else if (segment === "trades") {
        if (typeof EventSource !== "undefined") startTradesSse();
        else startFallbackPolling();
      } else if (segment === "chart") {
        stopSse();
        stopRetry();
        startChartPolling();
      } else {
        stopSse();
        stopRetry();
      }
    };

    const disconnect = () => {
      stopSse();
      stopRetry();
      stopPolling();
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        disconnect();
        connect();
      } else {
        disconnect();
      }
    };

    document.addEventListener("visibilitychange", onVis);
    connect();

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      disconnect();
      controller.abort();
    };
  }, [marketId, segment, candleRange]);

  // When switching pairs, clear panel state (avoids showing stale book/trades briefly).
  useEffect(() => {
    setDepth(null);
    setTrades(null);
    setCandles(null);
    setDepthError(null);
    setTradesError(null);
    setCandlesError(null);
  }, [marketId]);

  const closeSeries = useMemo(() => {
    const rows = candles?.candles ?? [];
    const pts = rows
      .map((c) => toNum(c.close))
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    return pts;
  }, [candles]);

  const spark = useMemo(() => {
    const pts = closeSeries;
    if (pts.length < 2) return null;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const w = 100;
    const h = 40;
    const step = w / (pts.length - 1);

    const d = pts
      .map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / span) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    const up = pts[pts.length - 1]! >= pts[0]!;
    return {
      d,
      up,
      min,
      max,
      first: pts[0]!,
      last: pts[pts.length - 1]!,
    };
  }, [closeSeries]);

  const placeOrder = async () => {
    if (!marketId) {
      setPlaceStatus({ kind: "error", message: "Market not available." });
      return;
    }
    if (market?.is_halted) {
      setPlaceStatus({ kind: "error", message: "This market is halted." });
      return;
    }

    const qty = quantity.trim();
    if (!qty) {
      setPlaceStatus({ kind: "error", message: "Enter an amount." });
      return;
    }

    if (orderType === "limit") {
      const p = limitPrice.trim();
      if (!p) {
        setPlaceStatus({ kind: "error", message: "Enter a limit price." });
        return;
      }
    } else if (orderType === "stop_limit") {
      const t = stopTriggerPrice.trim();
      const p = limitPrice.trim();
      if (!t) {
        setPlaceStatus({ kind: "error", message: "Enter a trigger price." });
        return;
      }
      if (!p) {
        setPlaceStatus({ kind: "error", message: "Enter a limit price." });
        return;
      }
    } else if (orderType === "oco") {
      const tp = ocoTakeProfitPrice.trim();
      const st = ocoStopTriggerPrice.trim();
      const sl = ocoStopLimitPrice.trim();
      if (!tp) {
        setPlaceStatus({ kind: "error", message: "Enter a take profit price." });
        return;
      }
      if (!st) {
        setPlaceStatus({ kind: "error", message: "Enter a stop trigger price." });
        return;
      }
      if (!sl) {
        setPlaceStatus({ kind: "error", message: "Enter a stop limit price." });
        return;
      }
    } else if (orderType === "trailing_stop") {
      const a = trailActivationPrice.trim();
      const p = limitPrice.trim();
      const bps = Number(trailBps);
      if (!a) {
        setPlaceStatus({ kind: "error", message: "Enter an activation price." });
        return;
      }
      if (!Number.isFinite(bps) || !Number.isInteger(bps) || bps < 1 || bps > 10_000) {
        setPlaceStatus({ kind: "error", message: "Trail bps must be an integer 1–10000." });
        return;
      }
      if (!p) {
        setPlaceStatus({ kind: "error", message: "Enter a limit price." });
        return;
      }
    }

    // Prevent accidental double-taps.
    const now = Date.now();
    if (now - lastPlacedAtRef.current < 900) return;
    lastPlacedAtRef.current = now;

    setPlaceStatus({ kind: "placing" });
    try {
      const isConditional = orderType === "stop_limit" || orderType === "oco" || orderType === "trailing_stop";

      const body =
        !isConditional
          ? (
              orderType === "limit"
                ? {
                    market_id: marketId,
                    side,
                    type: "limit",
                    price: limitPrice.trim(),
                    quantity: qty,
                  }
                : {
                    market_id: marketId,
                    side,
                    type: "market",
                    quantity: qty,
                  }
            )
          : (
              orderType === "stop_limit"
                ? {
                    kind: "stop_limit",
                    market_id: marketId,
                    side,
                    trigger_price: stopTriggerPrice.trim(),
                    limit_price: limitPrice.trim(),
                    quantity: qty,
                  }
                : orderType === "oco"
                  ? {
                      kind: "oco",
                      market_id: marketId,
                      side,
                      take_profit_price: ocoTakeProfitPrice.trim(),
                      stop_trigger_price: ocoStopTriggerPrice.trim(),
                      stop_limit_price: ocoStopLimitPrice.trim(),
                      quantity: qty,
                    }
                  : {
                      kind: "trailing_stop",
                      market_id: marketId,
                      side,
                      activation_price: trailActivationPrice.trim(),
                      trail_bps: Number(trailBps),
                      limit_price: limitPrice.trim(),
                      quantity: qty,
                    }
            );

      const res = await fetch(isConditional ? "/api/exchange/conditional-orders" : "/api/exchange/orders", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { _raw: text };
      }

      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        setPlaceStatus({ kind: "error", message: msg });
        return;
      }

      setPlaceStatus({ kind: "ok", message: isConditional ? "Conditional order created" : "Order placed" });
      setQuantity("");
      // Keep limit price for rapid re-entry.
    } catch (e) {
      setPlaceStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Trade</div>
            <div className="mt-0.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="truncate rounded-xl bg-[var(--v2-surface)] px-2 py-1 text-xl font-extrabold tracking-tight shadow-[var(--v2-shadow-sm)] hover:bg-[var(--v2-surface-2)]"
                title="Change pair"
              >
                {pairLabel}
              </button>
              <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2 py-1 text-[12px] font-semibold text-[var(--v2-muted)]">
                Spot
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[13px]">
              <span className="font-semibold text-[var(--v2-text)]">
                {marketLoading ? "…" : fmtPrice(last)}
              </span>
              <span className={`font-semibold ${changeClass}`}>{marketLoading ? "…" : changeText}</span>
              {market?.is_halted ? (
                <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-warn-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-warn)]">
                  Halted
                </span>
              ) : null}
              {marketError ? <span className="text-[12px] text-[var(--v2-down)]">Live data unavailable</span> : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-[var(--v2-muted)]">
              <span>24h H {marketLoading ? "…" : fmtPrice(high24h)}</span>
              <span>24h L {marketLoading ? "…" : fmtPrice(low24h)}</span>
              <span>Vol {marketLoading ? "…" : fmtPrice(volQuote)} {String(pair.quote).toUpperCase()}</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <V2Button variant="primary" size="sm" onClick={() => setSheetOpen(true)}>
              Pairs
            </V2Button>
            <Link
              href="/v2/convert"
              className={v2ButtonClassName({ variant: "secondary", size: "sm" })}
            >
              Convert
            </Link>
            <Link
              href="/v2/copy"
              className={v2ButtonClassName({ variant: "secondary", size: "sm" })}
            >
              Copy
            </Link>
            <Link
              href={`/v2/conditional?base=${encodeURIComponent(pair.base)}&quote=${encodeURIComponent(pair.quote)}`}
              className={v2ButtonClassName({ variant: "secondary", size: "sm" })}
            >
              Stops
            </Link>
          </div>
        </div>
      </header>

      <V2Tabs tabs={tabs} activeId={segment} onChange={(id) => setSegment(id as any)} />

      <V2Card>
        <V2CardHeader
          title={segment === "chart" ? "Chart" : segment === "book" ? "Order book" : "Recent trades"}
          subtitle={segment === "chart" ? "Price action" : segment === "book" ? "Liquidity" : "Latest fills"}
        />
        <V2CardBody>
          {segment === "chart" ? (
            candlesError ? (
              <div className="text-sm text-[var(--v2-down)]">Chart unavailable.</div>
            ) : candlesLoading && !candles ? (
              <V2Skeleton className="h-48 w-full" />
            ) : spark ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "1h", label: "1H" },
                    { id: "6h", label: "6H" },
                    { id: "8h", label: "8H" },
                  ] as const).map((r) => {
                    const active = candleRange === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setCandleRange(r.id)}
                        className={
                          "h-10 rounded-xl border px-3 text-[13px] font-semibold shadow-[var(--v2-shadow-sm)] " +
                          (active
                            ? "border-[var(--v2-border)] bg-[var(--v2-surface-2)] text-[var(--v2-text)]"
                            : "border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-muted)] hover:bg-[var(--v2-surface-2)]")
                        }
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                  <svg viewBox="0 0 100 40" width="100%" height="180" preserveAspectRatio="none" aria-label="Price chart">
                    <path
                      d={spark.d}
                      fill="none"
                      stroke={spark.up ? "var(--v2-up)" : "var(--v2-down)"}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[12px]">
                    <div className="text-[var(--v2-muted)]">min {fmtPrice(String(spark.min))}</div>
                    <div className={`font-semibold ${spark.up ? "text-[var(--v2-up)]" : "text-[var(--v2-down)]"}`}>last {fmtPrice(String(spark.last))}</div>
                    <div className="text-[var(--v2-muted)]">max {fmtPrice(String(spark.max))}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-[var(--v2-muted)]">No trades yet.</div>
            )
          ) : segment === "book" ? (
            depthError ? (
              <div className="text-sm text-[var(--v2-down)]">Order book unavailable.</div>
            ) : depthLoading && !depth ? (
              <V2Skeleton className="h-48 w-full" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-2 text-[12px] font-semibold text-[var(--v2-muted)]">Bids</div>
                  <div className="grid gap-1">
                    {(depth?.depth?.bids ?? []).slice(0, 12).map((r, i) => (
                      <div key={`b:${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--v2-surface-2)] px-2 py-1">
                        <div className="font-mono text-[12px] font-semibold text-[var(--v2-up)]">{fmtPrice(r.price)}</div>
                        <div className="font-mono text-[12px] text-[var(--v2-text)]">{fmtPrice(r.quantity)}</div>
                      </div>
                    ))}
                    {(depth?.depth?.bids ?? []).length === 0 ? (
                      <div className="text-[12px] text-[var(--v2-muted)]">No bids.</div>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[12px] font-semibold text-[var(--v2-muted)]">Asks</div>
                  <div className="grid gap-1">
                    {(depth?.depth?.asks ?? []).slice(0, 12).map((r, i) => (
                      <div key={`a:${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--v2-surface-2)] px-2 py-1">
                        <div className="font-mono text-[12px] font-semibold text-[var(--v2-down)]">{fmtPrice(r.price)}</div>
                        <div className="font-mono text-[12px] text-[var(--v2-text)]">{fmtPrice(r.quantity)}</div>
                      </div>
                    ))}
                    {(depth?.depth?.asks ?? []).length === 0 ? (
                      <div className="text-[12px] text-[var(--v2-muted)]">No asks.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          ) : (
            tradesError ? (
              <div className="text-sm text-[var(--v2-down)]">Trades unavailable.</div>
            ) : tradesLoading && !trades ? (
              <V2Skeleton className="h-48 w-full" />
            ) : (
              <div className="grid gap-1">
                {(trades?.trades ?? []).slice(0, 30).map((t) => {
                  const time = t.created_at ? new Date(t.created_at).toLocaleTimeString() : "";
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--v2-surface-2)] px-2 py-1">
                      <div className="font-mono text-[12px] text-[var(--v2-muted)]">{time}</div>
                      <div className="font-mono text-[12px] font-semibold text-[var(--v2-text)]">{fmtPrice(t.price)}</div>
                      <div className="font-mono text-[12px] text-[var(--v2-text)]">{fmtPrice(t.quantity)}</div>
                    </div>
                  );
                })}
                {(trades?.trades ?? []).length === 0 ? (
                  <div className="text-[12px] text-[var(--v2-muted)]">No trades yet.</div>
                ) : null}
              </div>
            )
          )}
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader
          title="Place order"
          subtitle={
            market?.is_halted
              ? "Market halted"
              : orderType === "market"
                ? "Market"
                : orderType === "limit"
                  ? "Limit"
                  : orderType === "stop_limit"
                    ? "Stop‑Limit"
                    : orderType === "oco"
                      ? "OCO"
                      : "Trailing stop"
          }
        />
        <V2CardBody>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <V2Button variant={side === "buy" ? "primary" : "secondary"} fullWidth onClick={() => setSide("buy")}>
                Buy
              </V2Button>
              <V2Button variant={side === "sell" ? "danger" : "secondary"} fullWidth onClick={() => setSide("sell")}>
                Sell
              </V2Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <V2Button variant={orderType === "market" ? "primary" : "secondary"} fullWidth onClick={() => setOrderType("market")}>
                Market
              </V2Button>
              <V2Button variant={orderType === "limit" ? "primary" : "secondary"} fullWidth onClick={() => setOrderType("limit")}>
                Limit
              </V2Button>
              <V2Button variant={orderType === "stop_limit" ? "primary" : "secondary"} fullWidth onClick={() => setOrderType("stop_limit")}>
                Stop
              </V2Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <V2Button variant={orderType === "oco" ? "primary" : "secondary"} fullWidth onClick={() => setOrderType("oco")}>
                OCO
              </V2Button>
              <V2Button variant={orderType === "trailing_stop" ? "primary" : "secondary"} fullWidth onClick={() => setOrderType("trailing_stop")}>
                Trail
              </V2Button>
            </div>

            {orderType === "limit" ? (
              <div className="grid gap-2">
                <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Limit price ({pair.quote})</div>
                <V2Input inputMode="decimal" placeholder={`0.00 ${pair.quote}`} value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
              </div>
            ) : orderType === "stop_limit" ? (
              <div className="grid gap-2">
                <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Trigger price ({pair.quote})</div>
                <V2Input inputMode="decimal" placeholder={`0.00 ${pair.quote}`} value={stopTriggerPrice} onChange={(e) => setStopTriggerPrice(e.target.value)} />
                <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Limit price ({pair.quote})</div>
                <V2Input inputMode="decimal" placeholder={`0.00 ${pair.quote}`} value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
              </div>
            ) : orderType === "oco" ? (
              <div className="grid gap-2">
                <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Take profit price ({pair.quote})</div>
                <V2Input inputMode="decimal" placeholder={`0.00 ${pair.quote}`} value={ocoTakeProfitPrice} onChange={(e) => setOcoTakeProfitPrice(e.target.value)} />
                <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Stop trigger price ({pair.quote})</div>
                <V2Input inputMode="decimal" placeholder={`0.00 ${pair.quote}`} value={ocoStopTriggerPrice} onChange={(e) => setOcoStopTriggerPrice(e.target.value)} />
                <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Stop limit price ({pair.quote})</div>
                <V2Input inputMode="decimal" placeholder={`0.00 ${pair.quote}`} value={ocoStopLimitPrice} onChange={(e) => setOcoStopLimitPrice(e.target.value)} />
              </div>
            ) : orderType === "trailing_stop" ? (
              <div className="grid gap-2">
                <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Activation price ({pair.quote})</div>
                <V2Input inputMode="decimal" placeholder={`0.00 ${pair.quote}`} value={trailActivationPrice} onChange={(e) => setTrailActivationPrice(e.target.value)} />
                <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Trail (bps)</div>
                <V2Input inputMode="numeric" placeholder="50" value={trailBps} onChange={(e) => setTrailBps(e.target.value)} />
                <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Limit price ({pair.quote})</div>
                <V2Input inputMode="decimal" placeholder={`0.00 ${pair.quote}`} value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
              </div>
            ) : null}

            <div className="grid gap-2">
              <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Amount</div>
              <V2Input inputMode="decimal" placeholder={`0.00 ${pair.base}`} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>

            <V2Button
              variant={side === "buy" ? "primary" : "danger"}
              size="lg"
              fullWidth
              disabled={placeStatus.kind === "placing" || !marketId || Boolean(market?.is_halted)}
              onClick={() => void placeOrder()}
            >
              {placeStatus.kind === "placing"
                ? "Placing…"
                : (orderType === "market" || orderType === "limit")
                  ? (side === "buy" ? "Buy" : "Sell")
                  : "Create"}
            </V2Button>

            {placeStatus.kind === "ok" ? (
              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-up-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-up)]">
                {placeStatus.message ?? "Order placed"}
              </div>
            ) : placeStatus.kind === "error" ? (
              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
                {placeStatus.message ?? "Order failed"}
              </div>
            ) : null}

            <div className="text-[12px] text-[var(--v2-muted)]">
              {orderType === "stop_limit" || orderType === "oco" || orderType === "trailing_stop"
                ? "Advanced orders require the conditional-orders cron/worker to be running."
                : "Next: fee preview, balance checks, and one-tap confirm."}
            </div>
          </div>
        </V2CardBody>
      </V2Card>

      <V2Sheet open={sheetOpen} title="Select a pair" onClose={() => setSheetOpen(false)}>
        <div className="grid gap-3">
          <V2Input value={pairSearch} onChange={(e) => setPairSearch(e.target.value)} placeholder="Search BTC, ETH…" />

          <div className="grid gap-2">
            {(markets.length ? markets : [{
              id: "fallback",
              symbol: "BTC/USDT",
              is_halted: false,
              base_symbol: pair.base,
              quote_symbol: pair.quote,
              stats: null,
            } as any]).filter((m) => {
              const q = pairSearch.trim().toUpperCase();
              if (!q) return true;
              const label = `${String(m.base_symbol).toUpperCase()}/${String(m.quote_symbol).toUpperCase()}`;
              return label.includes(q) || String(m.symbol).toUpperCase().includes(q);
            }).slice(0, 60).map((m) => {
              const p = { base: String(m.base_symbol).toUpperCase(), quote: String(m.quote_symbol).toUpperCase() };
              const label = `${p.base}/${p.quote}`;
              const active = p.base === pair.base && p.quote === pair.quote;
              const last = m.stats?.last ?? null;
              const chg = pctChange(m.stats?.open ?? null, m.stats?.last ?? null);
              const chgText = chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`;
              const chgClass = chg == null ? "text-[var(--v2-muted)]" : chg >= 0 ? "text-[var(--v2-up)]" : "text-[var(--v2-down)]";
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setPair(p);
                    setSheetOpen(false);
                  }}
                  className={
                    "flex h-12 items-center justify-between rounded-2xl border px-4 text-left shadow-[var(--v2-shadow-sm)] transition " +
                    (active
                      ? "border-[color-mix(in_srgb,var(--v2-accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--v2-accent)_10%,transparent)]"
                      : "border-[var(--v2-border)] bg-[var(--v2-surface)] hover:bg-[var(--v2-surface-2)]")
                  }
                >
                  <div className="text-[15px] font-semibold text-[var(--v2-text)]">{label}</div>
                  <div className="text-right">
                    <div className="text-[12px] font-semibold text-[var(--v2-text)]">{marketLoading ? "…" : fmtPrice(last)}</div>
                    <div className={`text-[11px] font-semibold ${chgClass}`}>{marketLoading ? "…" : chgText}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </V2Sheet>
    </main>
  );
}
