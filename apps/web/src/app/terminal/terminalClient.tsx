"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchJsonOrThrow } from "@/lib/api/client";
import { buttonClassName } from "@/components/ui/Button";
import { createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { toBigInt3818, fromBigInt3818 } from "@/lib/exchange/fixed3818";
import { quantizeDownToStep3818 } from "@/lib/exchange/steps";

type MarketRow = {
  id: string;
  chain: string;
  symbol: string;
  base_symbol: string;
  quote_symbol: string;
  halt_until?: string | null;
  is_halted?: boolean;
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

type BalanceRow = {
  symbol: string;
  available: string;
};

type ConditionalOrderRow = {
  id: string;
  kind: "stop_limit" | "oco" | "trailing_stop";
  side: "buy" | "sell";
  market_id: string;
  market_symbol: string;
  trigger_price: string;
  limit_price: string;
  take_profit_price: string | null;
  trail_bps: number | null;
  trailing_ref_price: string | null;
  trailing_stop_price: string | null;
  activated_at: string | null;
  triggered_leg: string | null;
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
const WORKSPACES_KEY = "cw_terminal_workspaces_v1";

type WorkspacePreset = {
  name: string;
  layout: LayoutState;
};

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

  const bidSum = useMemo(() => bids.reduce((acc, b) => acc + (Number(b.quantity) || 0), 0), [bids]);
  const askSum = useMemo(() => asks.reduce((acc, a) => acc + (Number(a.quantity) || 0), 0), [asks]);
  const imbalancePct = useMemo(() => {
    const tot = bidSum + askSum;
    if (!Number.isFinite(tot) || tot <= 0) return null;
    return Math.round(((bidSum / tot) * 10_000)) / 100;
  }, [bidSum, askSum]);

  const maxBidQty = useMemo(() => {
    let m = 0;
    for (const b of bids) m = Math.max(m, Number(b.quantity) || 0);
    return m;
  }, [bids]);
  const maxAskQty = useMemo(() => {
    let m = 0;
    for (const a of asks) m = Math.max(m, Number(a.quantity) || 0);
    return m;
  }, [asks]);

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
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Asks</div>
          {imbalancePct != null ? (
            <div className="text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">Imb {imbalancePct}% bid</div>
          ) : null}
        </div>
        <div className="border-t border-[var(--border)]">
          {loading && asks.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--muted)]">Loading…</div>
          ) : asks.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--muted)]">No asks</div>
          ) : (
            <table className="w-full text-[11px]">
              <tbody>
                {asks.slice(0, 14).map((a) => (
                  <tr
                    key={`a-${a.price}`}
                    className="border-b border-[var(--border)] last:border-b-0"
                    style={{
                      background:
                        maxAskQty > 0
                          ? `linear-gradient(to left, color-mix(in_srgb, var(--down) 14%, transparent) ${Math.min(100, Math.max(0, Math.round(((Number(a.quantity) || 0) * 100) / maxAskQty)))}%, transparent 0%)`
                          : undefined,
                    }}
                  >
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
                  <tr
                    key={`b-${b.price}`}
                    className="border-b border-[var(--border)] last:border-b-0"
                    style={{
                      background:
                        maxBidQty > 0
                          ? `linear-gradient(to right, color-mix(in_srgb, var(--up) 14%, transparent) ${Math.min(100, Math.max(0, Math.round(((Number(b.quantity) || 0) * 100) / maxBidQty)))}%, transparent 0%)`
                          : undefined,
                    }}
                  >
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
  const [mode, setMode] = useState<"all" | "mine">("all");
  const [largeOnly, setLargeOnly] = useState(false);

  const largeNotionalThreshold = 1000;

  const copyText = async (text: string) => {
    const v = String(text ?? "");
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      // ignore
    }
  };

  const load = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      if (mode === "mine") {
        const qs = new URLSearchParams({ status: "all", limit: "40", market_id: marketId });
        const data = await fetchJsonOrThrow<{ orders?: any[] }>(
          `/api/exchange/orders/history?${qs.toString()}`,
          withDevUserHeader({ cache: "no-store" }),
        );
        const orders = Array.isArray((data as any).orders) ? ((data as any).orders as any[]) : [];
        const fills: TradeRow[] = [];
        for (const o of orders) {
          const list = Array.isArray(o.fills) ? o.fills : [];
          for (const f of list) {
            fills.push({
              id: String(f.id ?? ""),
              price: String(f.price ?? "0"),
              quantity: String(f.quantity ?? "0"),
              maker_order_id: String(o.id ?? ""),
              taker_order_id: String(o.id ?? ""),
              created_at: String(f.created_at ?? ""),
            } as any);
          }
        }
        fills.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        setTrades(fills.slice(0, 60));
      } else {
        const qs = new URLSearchParams({ market_id: marketId, limit: "60" });
        const data = await fetchJsonOrThrow<{ trades?: any[] }>(
          `/api/exchange/marketdata/trades?${qs.toString()}`,
          withDevUserHeader({ cache: "no-store" }),
        );
        setTrades(Array.isArray((data as any).trades) ? ((data as any).trades as any[]) : []);
      }
    } catch {
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, [marketId, mode]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  if (!marketId) return <Placeholder title="Tape" hint="Select a market." />;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Tape</div>
          <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setMode("all")}
              className={
                "px-2 py-1 text-[10px] font-extrabold tracking-[0.12em] " +
                (mode === "all" ? "bg-[var(--card)] text-[var(--foreground)]" : "bg-[var(--bg)] text-[var(--muted)]")
              }
            >
              ALL
            </button>
            <button
              type="button"
              onClick={() => setMode("mine")}
              className={
                "border-l border-[var(--border)] px-2 py-1 text-[10px] font-extrabold tracking-[0.12em] " +
                (mode === "mine" ? "bg-[var(--card)] text-[var(--foreground)]" : "bg-[var(--bg)] text-[var(--muted)]")
              }
            >
              MINE
            </button>
          </div>

          <button
            type="button"
            onClick={() => setLargeOnly((v) => !v)}
            className={
              "rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-extrabold tracking-[0.12em] " +
              (largeOnly ? "bg-[var(--card)] text-[var(--foreground)]" : "bg-[var(--bg)] text-[var(--muted)]")
            }
            title={`Large = notional ≥ ${largeNotionalThreshold}`}
          >
            LARGE
          </button>
        </div>
        <div className="text-[10px] text-[var(--muted)]">{loading ? "sync" : `${trades.length}`}</div>
      </div>
      <div className="border-t border-[var(--border)]">
        {trades.length === 0 ? (
          <div className="px-3 py-3 text-xs text-[var(--muted)]">No trades</div>
        ) : (
          <table className="w-full text-[11px]">
            <tbody>
              {trades
                .filter((t) => {
                  if (!largeOnly) return true;
                  const px = Number(t.price);
                  const q = Number(t.quantity);
                  const n = (Number.isFinite(px) ? px : 0) * (Number.isFinite(q) ? q : 0);
                  return n >= largeNotionalThreshold;
                })
                .slice(0, 60)
                .map((t) => (
                  <tr key={t.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-1 font-semibold text-[var(--foreground)]">{fmtCompact(t.price, 8)}</td>
                    <td className="px-3 py-1 text-right text-[var(--muted)]">{fmtCompact(t.quantity, 8)}</td>
                    <td className="px-3 py-1 text-right text-[10px] text-[var(--muted)]">
                      {t.created_at ? new Date(t.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
                    </td>
                    <td className="px-3 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => void copyText(String(t.id))}
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] text-[var(--muted)] hover:bg-[var(--card-2)] hover:text-[var(--foreground)]"
                        title="Copy execution id"
                      >
                        ID
                      </button>
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
  const [type, setType] = useState<
    "limit" | "market" | "iceberg" | "stop_limit" | "oco" | "trailing_stop" | "twap" | "tp_ladder"
  >("limit");
  const [price, setPrice] = useState<string>("");
  const [triggerPrice, setTriggerPrice] = useState<string>("");
  const [takeProfitPrice, setTakeProfitPrice] = useState<string>("");
  const [trailBps, setTrailBps] = useState<string>("");
  const [timeInForce, setTimeInForce] = useState<"GTC" | "IOC" | "FOK">("GTC");
  const [postOnly, setPostOnly] = useState(false);
  const [qty, setQty] = useState<string>("");
  const [icebergDisplayQty, setIcebergDisplayQty] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [riskConfirmed, setRiskConfirmed] = useState(false);

  const [impactBids, setImpactBids] = useState<DepthLevel[]>([]);
  const [impactAsks, setImpactAsks] = useState<DepthLevel[]>([]);

  const [stops, setStops] = useState<ConditionalOrderRow[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);

  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const [twapPlans, setTwapPlans] = useState<
    Array<{
      id: string;
      status: string;
      side: string;
      total_quantity: string;
      remaining_quantity: string;
      slice_quantity: string;
      interval_sec: number;
      next_run_at: string;
      last_run_status: string | null;
      last_run_error: string | null;
    }>
  >([]);
  const [twapLoading, setTwapLoading] = useState(false);
  const [twapTotalQty, setTwapTotalQty] = useState<string>("");
  const [twapSlices, setTwapSlices] = useState<string>("6");
  const [twapIntervalSec, setTwapIntervalSec] = useState<string>("30");
  const [twapFirstRunSec, setTwapFirstRunSec] = useState<string>("3");
  const [twapTotpCode, setTwapTotpCode] = useState<string>("");

  const [tpLadderTotalQty, setTpLadderTotalQty] = useState<string>("");
  const [tpLadderLevels, setTpLadderLevels] = useState<string>("5");
  const [tpLadderStartPrice, setTpLadderStartPrice] = useState<string>("");
  const [tpLadderEndPrice, setTpLadderEndPrice] = useState<string>("");
  const [tpLadderBatchKey, setTpLadderBatchKey] = useState<string>("");

  useEffect(() => {
    setErr(null);
    setPrice("");
    setTriggerPrice("");
    setTakeProfitPrice("");
    setTrailBps("");
    setTimeInForce("GTC");
    setPostOnly(false);
    setQty("");
    setIcebergDisplayQty("");

    setTwapTotalQty("");
    setTwapSlices("6");
    setTwapIntervalSec("30");
    setTwapFirstRunSec("3");

    setTpLadderTotalQty("");
    setTpLadderLevels("5");
    setTpLadderStartPrice("");
    setTpLadderEndPrice("");
    setTpLadderBatchKey("");

    setRiskConfirmed(false);
  }, [market?.id]);

  useEffect(() => {
    // Keep a stable idempotency batch key for retries unless the user changes ladder inputs.
    setTpLadderBatchKey("");
  }, [tpLadderTotalQty, tpLadderLevels, tpLadderStartPrice, tpLadderEndPrice, side, market?.id]);

  const newIdempotencyKey = () => {
    const uuid = (globalThis as any)?.crypto?.randomUUID?.();
    if (uuid) return `tpl:${uuid}`;
    return `tpl:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  };

  const quoteSymbol = useMemo(() => {
    const sym = String(market?.symbol ?? "");
    const parts = sym.split("/");
    return parts.length === 2 ? parts[1]!.trim() : "QUOTE";
  }, [market?.symbol]);

  const loadImpactDepth = useCallback(async () => {
    if (!market?.id) {
      setImpactBids([]);
      setImpactAsks([]);
      return;
    }
    try {
      const qs = new URLSearchParams({ market_id: market.id, levels: "20" });
      const data = await fetchJsonOrThrow<{ depth?: { bids?: DepthLevel[]; asks?: DepthLevel[] } }>(
        `/api/exchange/marketdata/depth?${qs.toString()}`,
        withDevUserHeader({ cache: "no-store" }),
      );
      setImpactBids(Array.isArray(data.depth?.bids) ? (data.depth!.bids as any) : []);
      setImpactAsks(Array.isArray(data.depth?.asks) ? (data.depth!.asks as any) : []);
    } catch {
      setImpactBids([]);
      setImpactAsks([]);
    }
  }, [market?.id]);

  const loadBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const data = await fetchJsonOrThrow<{ balances?: any[] }>(
        "/api/exchange/balances",
        withDevUserHeader({ cache: "no-store" }),
      );
      const rows = Array.isArray(data.balances) ? data.balances : [];
      setBalances(
        rows
          .map((b) => ({
            symbol: String((b as any).symbol ?? "").toUpperCase(),
            available: String((b as any).available ?? "0"),
          }))
          .filter((b) => !!b.symbol),
      );
    } catch {
      setBalances([]);
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  const loadTwapPlans = useCallback(async () => {
    if (!market?.id) {
      setTwapPlans([]);
      return;
    }
    setTwapLoading(true);
    try {
      const qs = new URLSearchParams({ market_id: market.id, limit: "10" });
      const data = await fetchJsonOrThrow<{ plans?: any[] }>(
        `/api/exchange/twap?${qs.toString()}`,
        withDevUserHeader({ cache: "no-store" }),
      );
      setTwapPlans(Array.isArray(data.plans) ? (data.plans as any[]) : []);
    } catch {
      setTwapPlans([]);
    } finally {
      setTwapLoading(false);
    }
  }, [market?.id]);

  useEffect(() => {
    void loadImpactDepth();
    const t = setInterval(() => void loadImpactDepth(), 3000);
    return () => clearInterval(t);
  }, [loadImpactDepth]);

  useEffect(() => {
    void loadBalances();
    const t = setInterval(() => void loadBalances(), 12_000);
    return () => clearInterval(t);
  }, [loadBalances, market?.id]);

  useEffect(() => {
    void loadTwapPlans();
    const t = setInterval(() => void loadTwapPlans(), 12_000);
    return () => clearInterval(t);
  }, [loadTwapPlans]);

  const estimatedNotional = useMemo(() => {
    if (!market) return null;
    const qtyInput =
      type === "tp_ladder" ? tpLadderTotalQty : type === "twap" ? twapTotalQty : type === "iceberg" ? qty : qty;
    const q = Number(String(qtyInput ?? "").trim());
    if (!Number.isFinite(q) || q <= 0) return null;

    let px: number | null = null;
    if (type === "market") {
      const bid = market.book?.bid ? Number(market.book.bid) : NaN;
      const ask = market.book?.ask ? Number(market.book.ask) : NaN;
      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) px = (bid + ask) / 2;
      else if (Number.isFinite(ask) && ask > 0) px = ask;
      else if (Number.isFinite(bid) && bid > 0) px = bid;
    } else if (type === "tp_ladder") {
      const a = Number(String(tpLadderStartPrice ?? "").trim());
      const b = Number(String(tpLadderEndPrice ?? "").trim());
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) px = (a + b) / 2;
    } else {
      const p = Number(String(price ?? "").trim());
      if (Number.isFinite(p) && p > 0) px = p;
    }

    if (px == null || !Number.isFinite(px) || px <= 0) return null;
    return px * q;
  }, [market, price, qty, type, tpLadderTotalQty, tpLadderStartPrice, tpLadderEndPrice, twapTotalQty]);

  const highRiskThreshold = 5000;
  const requiresRiskConfirm = estimatedNotional != null && estimatedNotional >= highRiskThreshold;

  useEffect(() => {
    if (!requiresRiskConfirm && riskConfirmed) setRiskConfirmed(false);
  }, [requiresRiskConfirm, riskConfirmed]);

  const marketImpact = useMemo((): (
    | null
    | { kind: "estimate"; ok: boolean; filledQty: number; avgPrice: number; slipBps: number | null }
    | { kind: "error"; reason: string }
  ) => {
    if (!market) return null;
    if (type !== "market") return null;
    const q = Number(String(qty ?? "").trim());
    if (!Number.isFinite(q) || q <= 0) return null;

    const levels = side === "buy" ? impactAsks : impactBids;
    if (!Array.isArray(levels) || levels.length === 0) return { kind: "error", reason: "no_book" };

    let remaining = q;
    let filled = 0;
    let totalQuote = 0;

    for (const lvl of levels) {
      const px = Number(lvl.price);
      const avail = Number(lvl.quantity);
      if (!Number.isFinite(px) || px <= 0) continue;
      if (!Number.isFinite(avail) || avail <= 0) continue;
      const take = Math.min(remaining, avail);
      totalQuote += take * px;
      filled += take;
      remaining -= take;
      if (remaining <= 0) break;
    }

    if (!filled) return { kind: "error", reason: "no_liquidity" };

    const avg = totalQuote / filled;
    const best = levels.length > 0 ? Number(levels[0]!.price) : NaN;
    const slipBps = Number.isFinite(best) && best > 0
      ? Math.round(((Math.abs(avg - best) / best) * 10_000) * 100) / 100
      : null;

    return { kind: "estimate", ok: remaining <= 0, filledQty: filled, avgPrice: avg, slipBps };
  }, [impactAsks, impactBids, market, qty, side, type]);

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

  const close100 = async () => {
    if (!market) return;
    setErr(null);

    const base = String(market.base_symbol ?? "").trim().toUpperCase();
    const quote = String(market.quote_symbol ?? "").trim().toUpperCase();
    const lot = String(market.lot_size ?? "0.00000001");

    const findAvail = (sym: string) => {
      const row = balances.find((b) => b.symbol === sym);
      return row?.available ?? "0";
    };

    const SCALE = 10n ** 18n;
    const applyBps = (value: string, bps: number): string => {
      const v = toBigInt3818(value);
      const out = (v * BigInt(Math.max(0, Math.min(10_000, Math.trunc(bps))))) / 10_000n;
      return fromBigInt3818(out);
    };
    const divDown = (num: string, den: string): string => {
      const n = toBigInt3818(num);
      const d = toBigInt3818(den);
      if (d <= 0n) throw new Error("invalid_price");
      return fromBigInt3818((n * SCALE) / d);
    };

    try {
      let nextQty = "0";

      if (side === "sell") {
        const availBase = findAvail(base);
        nextQty = quantizeDownToStep3818(availBase, lot);
      } else {
        const availQuote = findAvail(quote);
        const safeSpend = applyBps(availQuote, 9950); // keep a tiny buffer for fees/rounding

        const px =
          String(market.book?.ask ?? "").trim() ||
          String(market.book?.mid ?? "").trim() ||
          String(market.stats?.last ?? "").trim();
        if (!px) throw new Error("no_price");

        const estQty = divDown(safeSpend, px);
        nextQty = quantizeDownToStep3818(estQty, lot);
      }

      if (toBigInt3818(nextQty) <= 0n) {
        setErr(side === "sell" ? "no_base_balance" : "no_quote_balance");
        return;
      }

      setType("market");
      setQty(nextQty);
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "close_failed";
      setErr(msg);
    }
  };

  const submit = async () => {
    if (!market) return;
    setErr(null);

    if (requiresRiskConfirm && !riskConfirmed) {
      setErr("confirm_high_risk_required");
      return;
    }

    setSubmitting(true);
    try {
      if (type === "iceberg") {
        const payload = {
          market_id: market.id,
          side,
          type: "limit" as const,
          price,
          quantity: qty,
          iceberg_display_quantity: icebergDisplayQty,
          time_in_force: timeInForce,
          post_only: postOnly,
        };
        await fetchJsonOrThrow(
          "/api/exchange/orders",
          withDevUserHeader({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        setQty("");
        setIcebergDisplayQty("");
        return;
      }

      if (type === "tp_ladder") {
        const levels = Math.trunc(Number(String(tpLadderLevels ?? "").trim()));
        if (!Number.isFinite(levels) || levels < 2 || levels > 25) {
          setErr("invalid_levels");
          return;
        }

        const lot = String(market.lot_size ?? "0.00000001");
        const tick = String(market.tick_size ?? "0.00000001");

        const totalQty = String(tpLadderTotalQty ?? "").trim();
        const startPx = String(tpLadderStartPrice ?? "").trim();
        const endPx = String(tpLadderEndPrice ?? "").trim();
        if (!totalQty || !startPx || !endPx) {
          setErr("missing_inputs");
          return;
        }

        const totalQtyBI = toBigInt3818(totalQty);
        if (totalQtyBI <= 0n) {
          setErr("invalid_quantity");
          return;
        }

        const startPxBI = toBigInt3818(startPx);
        const endPxBI = toBigInt3818(endPx);
        if (startPxBI <= 0n || endPxBI <= 0n) {
          setErr("invalid_price");
          return;
        }

        const baseQtyRaw = fromBigInt3818(totalQtyBI / BigInt(levels));
        const baseQtyStr = quantizeDownToStep3818(baseQtyRaw, lot);
        const baseQtyBI = toBigInt3818(baseQtyStr);
        if (baseQtyBI <= 0n) {
          setErr("quantity_too_small_for_levels");
          return;
        }

        const deltaPxBI = levels === 1 ? 0n : (endPxBI - startPxBI) / BigInt(levels - 1);

        const batchKey = tpLadderBatchKey || newIdempotencyKey();
        if (!tpLadderBatchKey) setTpLadderBatchKey(batchKey);

        for (let i = 0; i < levels; i++) {
          const pxBI = startPxBI + deltaPxBI * BigInt(i);
          const pxStr = quantizeDownToStep3818(fromBigInt3818(pxBI), tick);
          if (toBigInt3818(pxStr) <= 0n) {
            setErr("invalid_price");
            return;
          }

          const remainingBI = totalQtyBI - baseQtyBI * BigInt(levels - 1);
          const desiredQtyBI = i === levels - 1 ? remainingBI : baseQtyBI;
          const qtyStr = quantizeDownToStep3818(fromBigInt3818(desiredQtyBI), lot);
          if (toBigInt3818(qtyStr) <= 0n) {
            setErr("quantity_too_small_for_levels");
            return;
          }

          const payload = {
            market_id: market.id,
            side,
            type: "limit" as const,
            price: pxStr,
            quantity: qtyStr,
            time_in_force: timeInForce,
            post_only: postOnly,
            idempotency_key: `${batchKey}:${i}`,
          };

          await fetchJsonOrThrow(
            "/api/exchange/orders",
            withDevUserHeader({
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            }),
          );
        }

        setTpLadderTotalQty("");
        setTpLadderBatchKey("");
        return;
      }

      if (type === "twap") {
        const payload = {
          market_id: market.id,
          side,
          total_quantity: twapTotalQty,
          slice_count: Number(twapSlices) || 6,
          interval_sec: Number(twapIntervalSec) || 30,
          first_run_in_sec: Number(twapFirstRunSec) || 3,
          totp_code: (twapTotpCode || "").trim() || undefined,
        };
        await fetchJsonOrThrow(
          "/api/exchange/twap",
          withDevUserHeader({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        await loadTwapPlans();
        setTwapTotalQty("");
        return;
      }

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
      } else if (type === "oco") {
        const payload = {
          kind: "oco",
          market_id: market.id,
          side,
          take_profit_price: takeProfitPrice,
          stop_trigger_price: triggerPrice,
          stop_limit_price: price,
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
      } else if (type === "trailing_stop") {
        const payload = {
          kind: "trailing_stop",
          market_id: market.id,
          side,
          activation_price: triggerPrice,
          trail_bps: trailBps,
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
            : {
                market_id: market.id,
                side,
                type: "limit",
                price,
                quantity: qty,
                time_in_force: timeInForce,
                post_only: postOnly,
              };

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

  const setTwapStatus = async (id: string, status: "active" | "paused" | "canceled") => {
    setErr(null);
    try {
      await fetchJsonOrThrow(
        "/api/exchange/twap",
        withDevUserHeader({
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, status, totp_code: status === "active" ? (twapTotpCode.trim() || undefined) : undefined }),
        }),
      );
      await loadTwapPlans();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : "twap_update_failed");
    }
  };

  const onHotkey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (!submitting) void submit();
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

  <div className="grid grid-cols-8 gap-2">
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
          onClick={() => setType("iceberg")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
            (type === "iceberg"
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          Iceberg
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
        <button
          type="button"
          onClick={() => setType("oco")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
            (type === "oco"
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          OCO
        </button>

        <button
          type="button"
          onClick={() => setType("trailing_stop")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
            (type === "trailing_stop"
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          Trail
        </button>
        <button
          type="button"
          onClick={() => setType("twap")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
            (type === "twap"
              ? "border-[var(--accent-2)] bg-[color-mix(in_srgb,var(--accent-2)_10%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          TWAP
        </button>

        <button
          type="button"
          onClick={() => setType("tp_ladder")}
          className={
            "rounded-xl border px-3 py-2 text-xs font-semibold transition " +
            (type === "tp_ladder"
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--card))] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--card-2)]")
          }
        >
          TP Ladder
        </button>
      </div>

      {type === "limit" || type === "tp_ladder" || type === "iceberg" ? (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={timeInForce}
            onChange={(e) => setTimeInForce((e.target.value as any) || "GTC")}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
          >
            <option value="GTC">GTC</option>
            <option value="IOC">IOC</option>
            <option value="FOK">FOK</option>
          </select>

          <label className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]">
            <span className="text-[var(--muted)]">Post‑only</span>
            <input
              type="checkbox"
              checked={postOnly}
              onChange={(e) => setPostOnly(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
        </div>
      ) : null}

      {type === "oco" ? (
        <input
          value={takeProfitPrice}
          onChange={(e) => setTakeProfitPrice(e.target.value)}
          onKeyDown={onHotkey}
          placeholder="Take Profit Price"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      ) : null}

      {type === "stop_limit" || type === "oco" || type === "trailing_stop" ? (
        <input
          value={triggerPrice}
          onChange={(e) => setTriggerPrice(e.target.value)}
          onKeyDown={onHotkey}
          placeholder={type === "oco" ? "Stop Trigger Price" : type === "trailing_stop" ? "Activation Price" : "Trigger Price"}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      ) : null}

      {type === "trailing_stop" ? (
        <input
          value={trailBps}
          onChange={(e) => setTrailBps(e.target.value)}
          onKeyDown={onHotkey}
          placeholder="Trail (bps)"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      ) : null}

      {type === "limit" || type === "iceberg" || type === "stop_limit" || type === "oco" || type === "trailing_stop" ? (
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={onHotkey}
          placeholder={
            type === "oco"
              ? "Stop Limit Price"
              : type === "stop_limit"
                ? "Limit Price"
                : type === "trailing_stop"
                  ? "Limit Price"
                  : "Price"
          }
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      ) : null}

      {type === "iceberg" ? (
        <input
          value={icebergDisplayQty}
          onChange={(e) => setIcebergDisplayQty(e.target.value)}
          onKeyDown={onHotkey}
          placeholder="Display quantity"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      ) : null}

      {type === "twap" ? (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
            TWAP places market slices on a timer. Use small slices to reduce impact.
          </div>
          <input
            value={twapTotalQty}
            onChange={(e) => setTwapTotalQty(e.target.value)}
            onKeyDown={onHotkey}
            placeholder="Total quantity"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={twapSlices}
              onChange={(e) => setTwapSlices(e.target.value)}
              onKeyDown={onHotkey}
              placeholder="Slices"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
            />
            <input
              value={twapIntervalSec}
              onChange={(e) => setTwapIntervalSec(e.target.value)}
              onKeyDown={onHotkey}
              placeholder="Interval (sec)"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
            />
            <input
              value={twapFirstRunSec}
              onChange={(e) => setTwapFirstRunSec(e.target.value)}
              onKeyDown={onHotkey}
              placeholder="Start in (sec)"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
            />
          </div>
          <input
            value={twapTotpCode}
            onChange={(e) => setTwapTotpCode(e.target.value)}
            onKeyDown={onHotkey}
            placeholder="2FA code (if enabled)"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
          />

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">TWAP plans</div>
              <button
                type="button"
                onClick={() => void loadTwapPlans()}
                className="text-[10px] text-[var(--muted)] underline hover:text-[var(--foreground)]"
                disabled={twapLoading}
              >
                {twapLoading ? "sync" : "refresh"}
              </button>
            </div>
            <div className="border-t border-[var(--border)]">
              {twapPlans.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[var(--muted)]">No TWAP plans for this market.</div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {twapPlans.slice(0, 6).map((p) => (
                    <div key={p.id} className="px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-extrabold text-[var(--foreground)]">
                            {String(p.side).toUpperCase()} · rem {fmtCompact(String(p.remaining_quantity), 8)} · slice {fmtCompact(String(p.slice_quantity), 8)}
                          </div>
                          <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                            {p.status} · next {p.next_run_at ? new Date(String(p.next_run_at)).toLocaleTimeString() : "—"}
                            {p.last_run_error ? ` · ${p.last_run_error}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {p.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => void setTwapStatus(p.id, "paused")}
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]"
                            >
                              Pause
                            </button>
                          ) : p.status === "paused" ? (
                            <button
                              type="button"
                              onClick={() => void setTwapStatus(p.id, "active")}
                              className="rounded-lg bg-[var(--accent-2)] px-2 py-1 text-[11px] font-semibold text-white hover:brightness-110"
                            >
                              Resume
                            </button>
                          ) : null}
                          {p.status !== "completed" && p.status !== "canceled" ? (
                            <button
                              type="button"
                              onClick={() => void setTwapStatus(p.id, "canceled")}
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]"
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {type === "tp_ladder" ? (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
            Splits a total quantity into multiple limit orders across a price range.
          </div>
          <input
            value={tpLadderTotalQty}
            onChange={(e) => setTpLadderTotalQty(e.target.value)}
            onKeyDown={onHotkey}
            placeholder="Total quantity"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={tpLadderLevels}
              onChange={(e) => setTpLadderLevels(e.target.value)}
              onKeyDown={onHotkey}
              placeholder="Levels"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
            />
            <input
              value={tpLadderStartPrice}
              onChange={(e) => setTpLadderStartPrice(e.target.value)}
              onKeyDown={onHotkey}
              placeholder="Start price"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
            />
            <input
              value={tpLadderEndPrice}
              onChange={(e) => setTpLadderEndPrice(e.target.value)}
              onKeyDown={onHotkey}
              placeholder="End price"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
            />
          </div>
        </>
      ) : null}

      {type !== "twap" && type !== "tp_ladder" ? (
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={onHotkey}
          placeholder="Quantity"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
      ) : null}

      <button
        type="button"
        onClick={close100}
        disabled={!market || balancesLoading}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-extrabold tracking-tight text-[var(--foreground)] hover:bg-[var(--card-2)] disabled:opacity-60"
      >
        {balancesLoading ? "Loading balances…" : side === "buy" ? "Close 100% (buy with quote)" : "Close 100% (sell base)"}
      </button>

      {type === "market" ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
          {marketImpact ? (
            marketImpact.kind === "estimate" ? (
              <>
                Est. avg {marketImpact.avgPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })} {quoteSymbol}
                {marketImpact.slipBps != null ? ` · slip ${marketImpact.slipBps} bps` : ""}
                {!marketImpact.ok ? ` · partial (fills ${marketImpact.filledQty.toLocaleString(undefined, { maximumFractionDigits: 8 })})` : ""}
              </>
            ) : (
              <>Impact estimate: {marketImpact.reason}</>
            )
          ) : (
            <>Impact estimate: enter quantity</>
          )}
        </div>
      ) : null}

      {requiresRiskConfirm ? (
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]">
          <div className="min-w-0">
            <div className="font-extrabold tracking-tight">Confirm high-risk order</div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)]">
              Est. notional {estimatedNotional != null ? estimatedNotional.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"} {quoteSymbol}
              {" "}≥ {highRiskThreshold.toLocaleString()} {quoteSymbol}
            </div>
          </div>
          <input
            type="checkbox"
            checked={riskConfirmed}
            onChange={(e) => setRiskConfirmed(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
        </label>
      ) : null}

      {err ? (
        <div className="text-xs text-[var(--down)]">
          {err === "confirm_high_risk_required"
            ? "Please confirm the high-risk order checkbox."
            : err === "no_base_balance"
              ? `No available ${String(market.base_symbol ?? "base").toUpperCase()} balance.`
              : err === "no_quote_balance"
                ? `No available ${String(market.quote_symbol ?? "quote").toUpperCase()} balance.`
                : err}
        </div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || (requiresRiskConfirm && !riskConfirmed)}
        className={
          "w-full rounded-xl px-3 py-2 text-xs font-extrabold tracking-tight text-white hover:brightness-110 disabled:opacity-60 " +
          (side === "buy" ? "bg-[var(--up)]" : "bg-[var(--down)]")
        }
      >
        {submitting ? "Submitting…" : type === "twap" ? "Start TWAP" : side === "buy" ? "Place Buy" : "Place Sell"}
      </button>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Conditional</div>
          <div className="text-[10px] text-[var(--muted)]">{stopsLoading ? "sync" : `${stops.length}`}</div>
        </div>
        <div className="border-t border-[var(--border)]">
          {stops.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--muted)]">No conditional orders</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-3 py-2 text-left text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">K</th>
                  <th className="px-3 py-2 text-left text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">Side</th>
                  <th className="px-3 py-2 text-right text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">TP</th>
                  <th className="px-3 py-2 text-right text-[10px] font-extrabold tracking-[0.18em] text-[var(--muted)]">Stop</th>
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
      <td className="px-3 py-1 text-left text-[10px] font-extrabold tracking-[0.1em] text-[var(--muted)]">
        {o.kind === "oco" ? "O" : o.kind === "trailing_stop" ? "T" : "S"}
      </td>
      <td className={"px-3 py-1 font-extrabold " + (o.side === "buy" ? "text-[var(--up)]" : "text-[var(--down)]")}>{o.side.toUpperCase()}</td>
      <td className="px-3 py-1 text-right text-[var(--foreground)]">
        {o.kind === "trailing_stop" ? (o.trail_bps != null ? `${o.trail_bps}bps` : "—") : o.take_profit_price ? fmtCompact(o.take_profit_price, 8) : "—"}
      </td>
      <td className="px-3 py-1 text-right text-[var(--foreground)]">
        {o.kind === "trailing_stop"
          ? (o.trailing_stop_price ? fmtCompact(o.trailing_stop_price, 8) : fmtCompact(o.trigger_price, 8))
          : fmtCompact(o.trigger_price, 8)}
      </td>
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

  const [presets, setPresets] = useState<WorkspacePreset[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = safeJsonParse<WorkspacePreset[]>(window.localStorage.getItem(WORKSPACES_KEY));
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.name === "string" && p.layout && p.layout.version === 1) : [];
  });
  const [presetName, setPresetName] = useState<string>("default");

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase?.() ?? "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const map: Record<string, SlotId> = { "1": "A", "2": "B", "3": "C", "4": "D" };
        const slot = map[e.key];
        if (slot) {
          e.preventDefault();
          setLayout((prev) => ({
            ...prev,
            collapsed: { ...prev.collapsed, [slot]: !prev.collapsed?.[slot] },
          }));
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
      halt_until: x.halt_until ?? null,
      is_halted: Boolean(x.is_halted ?? false),
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
  }, [selectedMarketId]);

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

  const selectedHaltText = useMemo(() => {
    if (!selected?.is_halted) return null;
    const until = selected.halt_until ? new Date(selected.halt_until) : null;
    return until && Number.isFinite(until.getTime()) ? until.toLocaleString() : "soon";
  }, [selected?.halt_until, selected?.is_halted]);

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

  const applyPreset = (name: string) => {
    const p = presets.find((x) => x.name === name);
    if (!p) return;
    setLayout(p.layout);
  };

  const savePreset = () => {
    const name = presetName.trim() || "default";
    setPresetName(name);
    setPresets((prev) => {
      const next = prev.filter((p) => p.name !== name);
      next.push({ name, layout });
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });
  };

  const deletePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setPresets((prev) => prev.filter((p) => p.name !== name));
    setPresetName("default");
  };

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

            {selected?.is_halted ? (
              <div className="mt-2 rounded-lg border border-amber-300/40 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                Market halted until <span className="font-mono">{selectedHaltText ?? "soon"}</span>
              </div>
            ) : null}
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

            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <div className="text-[10px] font-extrabold tracking-[0.22em] text-[var(--muted)]">WS</div>
              <select
                value={presetName}
                onChange={(e) => {
                  const v = e.target.value;
                  setPresetName(v);
                  applyPreset(v);
                }}
                className="bg-transparent text-xs font-semibold text-[var(--foreground)] outline-none"
              >
                <option value="default">default</option>
                {presets
                  .filter((p) => p.name !== "default")
                  .map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={savePreset}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] text-[var(--muted)] hover:bg-[var(--card-2)] hover:text-[var(--foreground)]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={deletePreset}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] text-[var(--muted)] hover:bg-[var(--card-2)] hover:text-[var(--foreground)]"
              >
                Del
              </button>
            </div>

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

        <div className="relative mt-1 text-[10px] text-[var(--muted)]">
          Hotkeys: <span className="text-[var(--foreground)]">Ctrl+Enter</span> submit · <span className="text-[var(--foreground)]">Alt+1..4</span> dock/expand
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
