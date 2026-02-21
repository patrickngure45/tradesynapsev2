"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchJsonOrThrow } from "@/lib/api/client";
import { buttonClassName } from "@/components/ui/Button";
import { createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";

type MarketRow = {
  id: string;
  chain: string;
  symbol: string;
  base_symbol: string;
  quote_symbol: string;
  tick_size: string;
  lot_size: string;
  maker_fee_bps: number;
  taker_fee_bps: number;
  book: { bid: string | null; ask: string | null; mid: string | null };
  stats: {
    open: string;
    last: string;
    high: string;
    low: string;
    volume: string;
    quote_volume: string;
    trade_count: number;
  } | null;
};

type Candle = { t: string; o: string; h: string; l: string; c: string; v: string };

type DepthLevel = { price: string; quantity: string; order_count: number };
type TradeRow = { id: string; price: string; quantity: string; created_at: string };
type OpenOrderRow = {
  id: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: string;
  quantity: string;
  remaining_quantity: string;
  status: string;
  created_at: string;
};

type ConditionalOrderRow = {
  id: string;
  kind: "stop_limit";
  side: "buy" | "sell";
  market_id: string;
  market_symbol: string;
  trigger_price: string;
  limit_price: string;
  quantity: string;
  status: "active" | "triggering" | "triggered" | "canceled" | "failed";
  attempt_count: number;
  last_attempt_at: string | null;
  triggered_at: string | null;
  placed_order_id: string | null;
  failure_reason: string | null;
  created_at: string;
};

type PanelKind = "chart" | "orderbook" | "tape" | "orderEntry" | "openOrders" | "fills" | "watch";
type SlotId = "A" | "B" | "C" | "D";

type LayoutState = {
  version: 1;
  slots: Record<SlotId, PanelKind>;
  collapsed: Partial<Record<SlotId, boolean>>;
  density: "focus" | "pro";
};

const STORAGE_KEY = "cw_terminal_layout_v1";

function withDevUserHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const uid = localStorage.getItem("ts_user_id") ?? localStorage.getItem("pp_user_id");
    if (uid && !headers.has("x-user-id")) headers.set("x-user-id", uid);
  }
  return { ...init, headers, credentials: init?.credentials ?? "same-origin" };
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function defaultLayout(): LayoutState {
  return {
    version: 1,
    density: "pro",
    slots: { A: "chart", B: "orderEntry", C: "orderbook", D: "tape" },
    collapsed: {},
  };
}

function clampPanel(kind: string): PanelKind {
  const allowed: PanelKind[] = ["chart", "orderbook", "tape", "orderEntry", "openOrders", "fills", "watch"];
  return (allowed.includes(kind as any) ? (kind as PanelKind) : "chart") as PanelKind;
}

function formatPct(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const pct = (n * 100).toFixed(2);
  return `${pct}%`;
}

function formatNum(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtCompact(v: string, maxFrac = 8): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function titleForPanel(kind: PanelKind): string {
  switch (kind) {
    case "chart":
      return "Chart";
    case "orderbook":
      return "Orderbook";
    case "tape":
      return "Tape";
    case "orderEntry":
      return "Order";
    case "openOrders":
      return "Open";
    case "fills":
      return "Fills";
    case "watch":
      return "Watch";
  }
}

function panelOptions(): Array<{ value: PanelKind; label: string }> {
  return [
    { value: "chart", label: "Chart" },
    { value: "orderEntry", label: "Order" },
    { value: "orderbook", label: "Orderbook" },
    { value: "tape", label: "Tape" },
    { value: "openOrders", label: "Open Orders" },
    { value: "fills", label: "Fills" },
    { value: "watch", label: "Watchlist" },
  ];
}

function Slot({
  id,
  kind,
  density,
  collapsed,
  onToggleCollapse,
  onChangeKind,
  children,
}: {
  id: SlotId;
  kind: PanelKind;
  density: "focus" | "pro";
  collapsed: boolean;
  onToggleCollapse: () => void;
  onChangeKind: (k: PanelKind) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        "relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] " +
        (collapsed ? "h-[54px]" : "min-h-[260px]")
      }
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        style={{
          background:
            density === "pro"
              ? "linear-gradient(90deg, color-mix(in oklab, var(--accent) 10%, var(--bg)) 0%, var(--bg) 40%, color-mix(in oklab, var(--accent-2) 8%, var(--bg)) 100%)"
              : undefined,
        }}
      >
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-extrabold tracking-[0.24em] text-[var(--muted)]">{id}</div>
          <div className="text-xs font-semibold text-[var(--foreground)]">{titleForPanel(kind)}</div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => onChangeKind(clampPanel(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-semibold text-[var(--foreground)]"
            aria-label={`Slot ${id} panel selector`}
          >
            {panelOptions().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]"
          >
            {collapsed ? "Expand" : "Dock"}
          </button>
        </div>
      </div>

      {!collapsed ? <div className="p-3">{children}</div> : null}
    </section>
  );
}

function ChartPanel({ marketId }: { marketId: string | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const loadCandles = useCallback(async () => {
    if (!marketId) return;
    const qs = new URLSearchParams({ market_id: marketId, interval: "5m", limit: "300" });
    const data = await fetchJsonOrThrow<{ candles?: Candle[] }>(
      `/api/exchange/marketdata/candles?${qs.toString()}`,
      withDevUserHeader({ cache: "no-store" }),
    );
    const candles = Array.isArray(data.candles) ? data.candles : [];
    const series = seriesRef.current;
    if (!series) return;

    series.setData(
      candles
        .slice()
        .map((c) => ({
          time: Math.floor(new Date(c.t).getTime() / 1000) as any,
          open: Number(c.o),
          high: Number(c.h),
          low: Number(c.l),
          close: Number(c.c),
        }))
        .filter((x) => [x.open, x.high, x.low, x.close].every((n) => Number.isFinite(n))),
    );
  }, [marketId]);

  useEffect(() => {
    if (!ref.current) return;

    const el = ref.current;
    chartRef.current?.remove();
    chartRef.current = null;
    seriesRef.current = null;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: cssVar("--foreground", "rgba(190, 205, 235, 0.85)"),
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      timeScale: { borderColor: "rgba(255,255,255,0.10)" },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
      crosshair: { mode: 0 },
    });

    chartRef.current = chart;

    const up = cssVar("--up", "#00d084");
    const down = cssVar("--down", "#ff4c51");
    seriesRef.current = chart.addCandlestickSeries({
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
    });

    void loadCandles();
    const t = setInterval(loadCandles, 15_000);
    return () => {
      clearInterval(t);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [loadCandles]);

  return (
    <div className="space-y-2">
      {!marketId ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-xs text-[var(--muted)]">
          Select a market.
        </div>
      ) : null}
      <div ref={ref} className="h-[320px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg)]" />
    </div>
  );
}

function OrderbookPanel({ marketId }: { marketId: string | null }) {
  const [bids, setBids] = useState<DepthLevel[]>([]);
  const [asks, setAsks] = useState<DepthLevel[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ market_id: marketId, levels: "14" });
      const data = await fetchJsonOrThrow<{ depth?: { bids?: DepthLevel[]; asks?: DepthLevel[] } }>(
        `/api/exchange/marketdata/depth?${qs.toString()}`,
        withDevUserHeader({ cache: "no-store" }),
      );
      setBids(Array.isArray(data.depth?.bids) ? (data.depth!.bids as any) : []);
      setAsks(Array.isArray(data.depth?.asks) ? (data.depth!.asks as any) : []);
    } catch {
      setBids([]);
      setAsks([]);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  if (!marketId) return <Placeholder title="Orderbook" hint="Select a market." />;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
        <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Asks</div>
        <div className="border-t border-[var(--border)]">
          {loading && asks.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--muted)]">Loading…</div>
          ) : asks.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--muted)]">No asks</div>
          ) : (
            <table className="w-full text-[11px]">
              <tbody>
                {asks.slice(0, 14).map((a) => (
                  <tr key={`a-${a.price}`} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-1 font-semibold text-[var(--down)]">{fmtCompact(a.price, 8)}</td>
                    <td className="px-3 py-1 text-right text-[var(--foreground)]">{fmtCompact(a.quantity, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
        <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Bids</div>
        <div className="border-t border-[var(--border)]">
          {loading && bids.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--muted)]">Loading…</div>
          ) : bids.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--muted)]">No bids</div>
          ) : (
            <table className="w-full text-[11px]">
              <tbody>
                {bids.slice(0, 14).map((b) => (
                  <tr key={`b-${b.price}`} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-1 font-semibold text-[var(--up)]">{fmtCompact(b.price, 8)}</td>
                    <td className="px-3 py-1 text-right text-[var(--foreground)]">{fmtCompact(b.quantity, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function TapePanel({ marketId }: { marketId: string | null }) {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ market_id: marketId, limit: "60" });
      const data = await fetchJsonOrThrow<{ trades?: any[] }>(
        `/api/exchange/marketdata/trades?${qs.toString()}`,
        withDevUserHeader({ cache: "no-store" }),
      );
      setTrades(Array.isArray((data as any).trades) ? ((data as any).trades as any[]) : []);
    } catch {
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  if (!marketId) return <Placeholder title="Tape" hint="Select a market." />;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Executions</div>
        <div className="text-[10px] text-[var(--muted)]">{loading ? "sync" : `${trades.length}`}</div>
      </div>
      <div className="border-t border-[var(--border)]">
        {trades.length === 0 ? (
          <div className="px-3 py-3 text-xs text-[var(--muted)]">No trades</div>
        ) : (
          <table className="w-full text-[11px]">
            <tbody>
              {trades.slice(0, 60).map((t) => (
                <tr key={t.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-3 py-1 font-semibold text-[var(--foreground)]">{fmtCompact(t.price, 8)}</td>
                  <td className="px-3 py-1 text-right text-[var(--muted)]">{fmtCompact(t.quantity, 8)}</td>
                  <td className="px-3 py-1 text-right text-[10px] text-[var(--muted)]">
                    {new Date(t.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OpenOrdersPanel({ marketId }: { marketId: string | null }) {
  const [orders, setOrders] = useState<OpenOrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (marketId) qs.set("market_id", marketId);
      const data = await fetchJsonOrThrow<{ orders?: any[] }>(
        `/api/exchange/orders?${qs.toString()}`,
        withDevUserHeader({ cache: "no-store" }),
      );
      setOrders(Array.isArray((data as any).orders) ? ((data as any).orders as any[]) : []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Open orders</div>
        <div className="text-[10px] text-[var(--muted)]">{loading ? "sync" : `${orders.length}`}</div>
      </div>
      <div className="border-t border-[var(--border)]">
        {orders.length === 0 ? (
          <div className="px-3 py-3 text-xs text-[var(--muted)]">No orders</div>
        ) : (
          <table className="w-full text-[11px]">
            <tbody>
              {orders.slice(0, 20).map((o) => (
                <tr key={o.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className={"px-3 py-1 font-extrabold " + (o.side === "buy" ? "text-[var(--up)]" : "text-[var(--down)]")}>
                    {o.side.toUpperCase()}
                  </td>
                  <td className="px-3 py-1 text-[var(--foreground)]">{o.type === "market" ? "MKT" : fmtCompact(o.price, 8)}</td>
                  <td className="px-3 py-1 text-right text-[var(--muted)]">{fmtCompact(o.remaining_quantity, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FillsPanel({ marketId }: { marketId: string | null }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: "all", limit: "40" });
      if (marketId) qs.set("market_id", marketId);
      const data = await fetchJsonOrThrow<{ orders?: any[] }>(
        `/api/exchange/orders/history?${qs.toString()}`,
        withDevUserHeader({ cache: "no-store" }),
      );
      setRows(Array.isArray((data as any).orders) ? ((data as any).orders as any[]) : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Fills</div>
        <div className="text-[10px] text-[var(--muted)]">{loading ? "sync" : `${rows.length}`}</div>
      </div>
      <div className="border-t border-[var(--border)]">
        {rows.length === 0 ? (
          <div className="px-3 py-3 text-xs text-[var(--muted)]">No history</div>
        ) : (
          <table className="w-full text-[11px]">
            <tbody>
              {rows.slice(0, 18).map((o) => {
                const fills = Array.isArray(o.fills) ? o.fills : [];
                const lastFill = fills.length > 0 ? fills[fills.length - 1] : null;
                return (
                  <tr key={String(o.id)} className="border-b border-[var(--border)] last:border-b-0">
                    <td className={"px-3 py-1 font-extrabold " + (String(o.side) === "buy" ? "text-[var(--up)]" : "text-[var(--down)]")}>
                      {String(o.side).toUpperCase()}
                    </td>
                    <td className="px-3 py-1 text-[var(--foreground)]">{String(o.type) === "market" ? "MKT" : fmtCompact(String(o.price), 8)}</td>
                    <td className="px-3 py-1 text-right text-[var(--muted)]">{fmtCompact(String(o.quantity), 8)}</td>
                    <td className="px-3 py-1 text-right text-[10px] text-[var(--muted)]">
                      {lastFill?.created_at ? new Date(String(lastFill.created_at)).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OrderEntryPanel({ market }: { market: MarketRow | null }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"limit" | "market" | "stop_limit">("limit");
  const [price, setPrice] = useState<string>("");
  const [triggerPrice, setTriggerPrice] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [stops, setStops] = useState<ConditionalOrderRow[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);

  useEffect(() => {
    setErr(null);
    setPrice("");
    setTriggerPrice("");
    setQty("");
  }, [market?.id]);

  const loadStops = useCallback(async () => {
    if (!market?.id) {
      setStops([]);
      return;
    }
    setStopsLoading(true);
    try {
      const qs = new URLSearchParams({ market_id: market.id, status: "all", limit: "50" });
      const data = await fetchJsonOrThrow<{ conditional_orders?: ConditionalOrderRow[] }>(
        `/api/exchange/conditional-orders?${qs.toString()}`,
        withDevUserHeader({ cache: "no-store" }),
      );
      const rows = Array.isArray(data.conditional_orders) ? data.conditional_orders : [];
      setStops(rows);
    } finally {
      setStopsLoading(false);
    }
  }, [market?.id]);

  useEffect(() => {
    void loadStops();
    const t = setInterval(() => void loadStops(), 6000);
    return () => clearInterval(t);
  }, [loadStops]);

  const hint = useMemo(() => {
    if (!market) return "Select a market.";
    const bid = market.book?.bid ? fmtCompact(market.book.bid, 8) : "—";
    const ask = market.book?.ask ? fmtCompact(market.book.ask, 8) : "—";
    return `Bid ${bid} · Ask ${ask} · tick ${market.tick_size} · lot ${market.lot_size}`;
  }, [market]);

  const submit = async () => {
    if (!market) return;
    setErr(null);
    setSubmitting(true);
    try {
      if (type === "stop_limit") {
        const payload = {
          kind: "stop_limit",
          market_id: market.id,
          side,
          trigger_price: triggerPrice,
          limit_price: price,
          quantity: qty,
        };
        await fetchJsonOrThrow(
          "/api/exchange/conditional-orders",
          withDevUserHeader({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        await loadStops();
      } else {
        const payload =
          type === "market"
            ? { market_id: market.id, side, type: "market", quantity: qty }
            : { market_id: market.id, side, type: "limit", price, quantity: qty };

        await fetchJsonOrThrow(
          "/api/exchange/orders",
          withDevUserHeader({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
      }

      setQty("");
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "order_failed";
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!market) return <Placeholder title="Order" hint="Select a market." />;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">{hint}</div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-extrabold tracking-tight transition " +
            (side === "buy"
              ? "border-[var(--up)] bg-[color-mix(in_srgb,var(--up)_12%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-extrabold tracking-tight transition " +
            (side === "sell"
              ? "border-[var(--down)] bg-[color-mix(in_srgb,var(--down)_10%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          Sell
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setType("limit")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
            (type === "limit"
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          Limit
        </button>
        <button
          type="button"
          onClick={() => setType("market")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
            (type === "market"
              ? "border-[var(--accent-2)] bg-[color-mix(in_srgb,var(--accent-2)_10%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          Market
        </button>
        <button
          type="button"
          onClick={() => setType("stop_limit")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
            (type === "stop_limit"
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          Stop‑Limit
        </button>
      </div>

      {type === "stop_limit" ? (
        <input
          value={triggerPrice}
          onChange={(e) => setTriggerPrice(e.target.value)}
          placeholder="Trigger Price"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      ) : null}

      {type === "limit" || type === "stop_limit" ? (
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={type === "stop_limit" ? "Limit Price" : "Price"}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      ) : null}

      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Quantity"
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
      />

      {err ? <div className="text-xs text-[var(--down)]">{err}</div> : null}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className={
          "w-full rounded-xl px-3 py-2 text-xs font-extrabold tracking-tight text-white hover:brightness-110 disabled:opacity-60 " +
          (side === "buy" ? "bg-[var(--up)]" : "bg-[var(--down)]")
        }
      >
        {submitting ? "Submitting…" : side === "buy" ? "Place Buy" : "Place Sell"}
      </button>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Stops</div>
          <div className="text-[10px] text-[var(--muted)]">{stopsLoading ? "sync" : `${stops.length}`}</div>
        </div>
        <div className="border-t border-[var(--border)]">
          {stops.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--muted)]">No conditional orders</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-3 py-2 text-left text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">Side</th>
                  <th className="px-3 py-2 text-right text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">Trig</th>
                  <th className="px-3 py-2 text-right text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">Limit</th>
                  <th className="px-3 py-2 text-right text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">Qty</th>
                  <th className="px-3 py-2 text-right text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">St</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {stops.slice(0, 12).map((o) => (
                  <StopRow key={o.id} o={o} onChanged={loadStops} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StopRow({ o, onChanged }: { o: ConditionalOrderRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const canCancel = o.status === "active" || o.status === "triggering";

  const cancel = async () => {
    if (!canCancel) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ id: o.id });
      await fetchJsonOrThrow(`/api/exchange/conditional-orders?${qs.toString()}`, withDevUserHeader({ method: "DELETE" }));
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-[var(--border)] last:border-b-0">
      <td className={"px-3 py-1 font-extrabold " + (o.side === "buy" ? "text-[var(--up)]" : "text-[var(--down)]")}>{o.side.toUpperCase()}</td>
      <td className="px-3 py-1 text-right text-[var(--foreground)]">{fmtCompact(o.trigger_price, 8)}</td>
      <td className="px-3 py-1 text-right text-[var(--foreground)]">{fmtCompact(o.limit_price, 8)}</td>
      <td className="px-3 py-1 text-right text-[var(--muted)]">{fmtCompact(o.quantity, 8)}</td>
      <td className="px-3 py-1 text-right text-[10px] font-extrabold tracking-[0.1em] text-[var(--muted)]">{String(o.status).slice(0, 1).toUpperCase()}</td>
      <td className="px-3 py-1 text-right">
        {canCancel ? (
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] text-[var(--muted)] hover:bg-[var(--card-2)] hover:text-[var(--foreground)] disabled:opacity-60"
          >
            X
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function Placeholder({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="text-xs font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>
    </div>
  );
}

export function TerminalClient() {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [marketQuery, setMarketQuery] = useState("");
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  const [layout, setLayout] = useState<LayoutState>(() => {
    if (typeof window === "undefined") return defaultLayout();
    const saved = safeJsonParse<LayoutState>(window.localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== 1) return defaultLayout();
    return {
      version: 1,
      density: saved.density === "focus" ? "focus" : "pro",
      slots: {
        A: clampPanel(saved.slots?.A ?? "chart"),
        B: clampPanel(saved.slots?.B ?? "orderEntry"),
        C: clampPanel(saved.slots?.C ?? "orderbook"),
        D: clampPanel(saved.slots?.D ?? "tape"),
      },
      collapsed: saved.collapsed ?? {},
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  const loadMarkets = useCallback(async () => {
    const qs = new URLSearchParams({ fiat: "USD" });
    const data = await fetchJsonOrThrow<{ markets?: any[] }>(
      `/api/exchange/markets/overview?${qs.toString()}`,
      withDevUserHeader({ cache: "no-store" }),
    );
    const m = Array.isArray((data as any).markets) ? ((data as any).markets as any[]) : [];
    const mapped: MarketRow[] = m.map((x) => ({
      id: String(x.id ?? ""),
      chain: String(x.chain ?? "bsc"),
      symbol: String(x.symbol ?? ""),
      base_symbol: String(x.base_symbol ?? ""),
      quote_symbol: String(x.quote_symbol ?? ""),
      tick_size: String(x.tick_size ?? "0.00000001"),
      lot_size: String(x.lot_size ?? "0.00000001"),
      maker_fee_bps: Number(x.maker_fee_bps ?? 0) || 0,
      taker_fee_bps: Number(x.taker_fee_bps ?? 0) || 0,
      book: {
        bid: x.book?.bid ?? null,
        ask: x.book?.ask ?? null,
        mid: x.book?.mid ?? null,
      },
      stats: x.stats
        ? {
            open: String(x.stats.open ?? "0"),
            last: String(x.stats.last ?? "0"),
            high: String(x.stats.high ?? "0"),
            low: String(x.stats.low ?? "0"),
            volume: String(x.stats.volume ?? "0"),
            quote_volume: String(x.stats.quote_volume ?? "0"),
            trade_count: Number(x.stats.trade_count ?? 0) || 0,
          }
        : null,
    }));
    const clean = mapped.filter((r) => r.id && r.symbol);
    setMarkets(clean);

    if (!selectedMarketId && clean.length > 0) {
      setSelectedMarketId(clean[0]!.id);
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
    const t = setInterval(loadMarkets, 25_000);
    return () => clearInterval(t);
  }, [loadMarkets]);

  const filtered = useMemo(() => {
    const q = marketQuery.trim().toUpperCase();
    if (!q) return markets.slice(0, 40);
    return markets
      .filter((m) => m.symbol.toUpperCase().includes(q) || m.base_symbol.toUpperCase().includes(q))
      .slice(0, 40);
  }, [markets, marketQuery]);

  const selected = useMemo(() => markets.find((m) => m.id === selectedMarketId) ?? null, [markets, selectedMarketId]);

  const setSlotKind = (slot: SlotId, kind: PanelKind) => {
    setLayout((prev) => ({ ...prev, slots: { ...prev.slots, [slot]: kind } }));
  };
  const toggleCollapse = (slot: SlotId) => {
    setLayout((prev) => ({
      ...prev,
      collapsed: { ...prev.collapsed, [slot]: !prev.collapsed?.[slot] },
    }));
  };

  const resetLayout = () => setLayout(defaultLayout());

  const densityLabel = layout.density === "pro" ? "Pro" : "Focus";

  return (
    <div className="space-y-4">
      {/* Command strip */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(900px 260px at 10% 0%, color-mix(in oklab, var(--accent) 18%, transparent) 0%, transparent 60%), radial-gradient(560px 240px at 90% 10%, color-mix(in oklab, var(--accent-2) 14%, transparent) 0%, transparent 55%)",
          }}
        />

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[240px]">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Coinwaka Terminal</div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="text-sm font-extrabold text-[var(--foreground)]">{selected?.symbol ?? "Select market"}</div>
              <div className="text-[11px] text-[var(--muted)]">
                {selected?.stats?.last ? `Last ${formatNum(selected.stats.last)}` : ""}
                {selected?.stats?.quote_volume ? ` · Vol ${formatNum(selected.stats.quote_volume)}` : ""}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <div className="text-[10px] font-extrabold tracking-[0.22em] text-[var(--muted)]">FIND</div>
              <input
                value={marketQuery}
                onChange={(e) => setMarketQuery(e.target.value)}
                placeholder="BTC, ETH, SOL…"
                className="w-full bg-transparent text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none"
              />
            </div>

            <select
              value={layout.density}
              onChange={(e) => setLayout((p) => ({ ...p, density: e.target.value === "focus" ? "focus" : "pro" }))}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
            >
              <option value="focus">Focus</option>
              <option value="pro">Pro</option>
            </select>

            <button
              type="button"
              onClick={resetLayout}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)]"
            >
              Reset layout
            </button>
            <Link href="/home" className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Home
            </Link>
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMarketId(m.id)}
                className={
                  "rounded-xl border px-3 py-2 text-left transition " +
                  (m.id === selectedMarketId
                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--card))]"
                    : "border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--card-2)]")
                }
              >
                <div className="text-xs font-extrabold text-[var(--foreground)] truncate">{m.symbol}</div>
                <div className="mt-0.5 text-[10px] text-[var(--muted)] truncate">
                  {m.stats?.last ? `Last ${formatNum(m.stats.last)}` : "—"} · {m.book?.bid ? `B ${fmtCompact(m.book.bid, 6)}` : "B —"} / {m.book?.ask ? `A ${fmtCompact(m.book.ask, 6)}` : "A —"}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="relative mt-3 text-xs text-[var(--muted)]">Loading markets…</div>
        )}

        <div className="relative mt-3 text-[11px] text-[var(--muted)]">
          Mode: <span className="text-[var(--foreground)] font-semibold">{densityLabel}</span> · Slots A–D are dockable.
        </div>
      </div>

      {/* Workspace dock */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Slot
          id="A"
          kind={layout.slots.A}
          density={layout.density}
          collapsed={!!layout.collapsed.A}
          onToggleCollapse={() => toggleCollapse("A")}
          onChangeKind={(k) => setSlotKind("A", k)}
        >
          {layout.slots.A === "chart" ? (
            <ChartPanel marketId={selectedMarketId} />
          ) : layout.slots.A === "orderEntry" ? (
            <OrderEntryPanel market={selected} />
          ) : layout.slots.A === "orderbook" ? (
            <OrderbookPanel marketId={selectedMarketId} />
          ) : layout.slots.A === "tape" ? (
            <TapePanel marketId={selectedMarketId} />
          ) : layout.slots.A === "openOrders" ? (
            <OpenOrdersPanel marketId={selectedMarketId} />
          ) : layout.slots.A === "fills" ? (
            <FillsPanel marketId={selectedMarketId} />
          ) : (
            <Placeholder title="Watchlist" hint="Use /home to manage your watchlist." />
          )}
        </Slot>

        <Slot
          id="B"
          kind={layout.slots.B}
          density={layout.density}
          collapsed={!!layout.collapsed.B}
          onToggleCollapse={() => toggleCollapse("B")}
          onChangeKind={(k) => setSlotKind("B", k)}
        >
          {layout.slots.B === "chart" ? (
            <ChartPanel marketId={selectedMarketId} />
          ) : layout.slots.B === "orderEntry" ? (
            <OrderEntryPanel market={selected} />
          ) : layout.slots.B === "orderbook" ? (
            <OrderbookPanel marketId={selectedMarketId} />
          ) : layout.slots.B === "tape" ? (
            <TapePanel marketId={selectedMarketId} />
          ) : layout.slots.B === "openOrders" ? (
            <OpenOrdersPanel marketId={selectedMarketId} />
          ) : layout.slots.B === "fills" ? (
            <FillsPanel marketId={selectedMarketId} />
          ) : (
            <Placeholder title="Watchlist" hint="Use /home to manage your watchlist." />
          )}
        </Slot>

        <Slot
          id="C"
          kind={layout.slots.C}
          density={layout.density}
          collapsed={!!layout.collapsed.C}
          onToggleCollapse={() => toggleCollapse("C")}
          onChangeKind={(k) => setSlotKind("C", k)}
        >
          {layout.slots.C === "chart" ? (
            <ChartPanel marketId={selectedMarketId} />
          ) : layout.slots.C === "orderEntry" ? (
            <OrderEntryPanel market={selected} />
          ) : layout.slots.C === "orderbook" ? (
            <OrderbookPanel marketId={selectedMarketId} />
          ) : layout.slots.C === "tape" ? (
            <TapePanel marketId={selectedMarketId} />
          ) : layout.slots.C === "openOrders" ? (
            <OpenOrdersPanel marketId={selectedMarketId} />
          ) : layout.slots.C === "fills" ? (
            <FillsPanel marketId={selectedMarketId} />
          ) : (
            <Placeholder title="Watchlist" hint="Use /home to manage your watchlist." />
          )}
        </Slot>

        <Slot
          id="D"
          kind={layout.slots.D}
          density={layout.density}
          collapsed={!!layout.collapsed.D}
          onToggleCollapse={() => toggleCollapse("D")}
          onChangeKind={(k) => setSlotKind("D", k)}
        >
          {layout.slots.D === "chart" ? (
            <ChartPanel marketId={selectedMarketId} />
          ) : layout.slots.D === "orderEntry" ? (
            <OrderEntryPanel market={selected} />
          ) : layout.slots.D === "orderbook" ? (
            <OrderbookPanel marketId={selectedMarketId} />
          ) : layout.slots.D === "tape" ? (
            <TapePanel marketId={selectedMarketId} />
          ) : layout.slots.D === "openOrders" ? (
            <OpenOrdersPanel marketId={selectedMarketId} />
          ) : layout.slots.D === "fills" ? (
            <FillsPanel marketId={selectedMarketId} />
          ) : (
            <Placeholder title="Watchlist" hint="Use /home to manage your watchlist." />
          )}
        </Slot>
      </div>

      <div className="text-[11px] text-[var(--muted)]">
        Tip: this workspace is layout-driven. Next we’ll wire live orderbook/tape and advanced order entry (OCO/stop/trailing) into these slots.
      </div>
    </div>
  );
}
