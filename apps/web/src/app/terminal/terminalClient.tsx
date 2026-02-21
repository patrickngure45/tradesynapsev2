"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchJsonOrThrow } from "@/lib/api/client";
import { buttonClassName } from "@/components/ui/Button";
import { createChart, type IChartApi } from "lightweight-charts";

type MarketRow = {
  id: string;
  chain: string;
  symbol: string;
  base_symbol: string;
  quote_symbol: string;
  last: string | null;
  change_pct_24h: string | null;
  volume_quote_24h: string | null;
};

type Candle = { t: string; o: string; h: string; l: string; c: string; v: string };

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

  const loadCandles = useCallback(async () => {
    if (!marketId) return;
    const qs = new URLSearchParams({ market_id: marketId, interval: "5m", limit: "300" });
    const data = await fetchJsonOrThrow<{ candles?: Candle[] }>(
      `/api/exchange/marketdata/candles?${qs.toString()}`,
      withDevUserHeader({ cache: "no-store" }),
    );
    const candles = Array.isArray(data.candles) ? data.candles : [];
    const series = chartRef.current?.addCandlestickSeries({
      upColor: "rgba(0, 208, 132, 1)",
      downColor: "rgba(255, 76, 81, 1)",
      borderVisible: false,
      wickUpColor: "rgba(0, 208, 132, 1)",
      wickDownColor: "rgba(255, 76, 81, 1)",
    });
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

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "rgba(190, 205, 235, 0.85)",
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
    void loadCandles();
    const t = setInterval(loadCandles, 15_000);
    return () => {
      clearInterval(t);
      chart.remove();
      chartRef.current = null;
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
      last: x.last ?? null,
      change_pct_24h: x.change_pct_24h ?? null,
      volume_quote_24h: x.volume_quote_24h ?? null,
    }));
    setMarkets(mapped.filter((r) => r.id && r.symbol));
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
                {selected?.last ? `Last ${formatNum(selected.last)}` : ""}
                {selected?.change_pct_24h ? ` · 24h ${formatPct(selected.change_pct_24h)}` : ""}
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
                  {m.last ? `Last ${formatNum(m.last)}` : "—"} · {m.change_pct_24h ? formatPct(m.change_pct_24h) : "—"}
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
            <Placeholder title="Order entry" hint="Coming next: limit/market + advanced order types." />
          ) : layout.slots.A === "orderbook" ? (
            <Placeholder title="Orderbook" hint="Coming next: depth ladder + imbalance view." />
          ) : layout.slots.A === "tape" ? (
            <Placeholder title="Tape" hint="Coming next: executions grouped by burst." />
          ) : layout.slots.A === "openOrders" ? (
            <Placeholder title="Open orders" hint="Coming next: cancel + filters." />
          ) : layout.slots.A === "fills" ? (
            <Placeholder title="Fills" hint="Coming next: slippage + fees per fill." />
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
            <Placeholder title="Order entry" hint="Coming next: post-only, tif, and order preview." />
          ) : layout.slots.B === "orderbook" ? (
            <Placeholder title="Orderbook" hint="Coming next: depth + ladder." />
          ) : layout.slots.B === "tape" ? (
            <Placeholder title="Tape" hint="Coming next: execution bursts." />
          ) : layout.slots.B === "openOrders" ? (
            <Placeholder title="Open orders" hint="Coming next: cancel / modify." />
          ) : layout.slots.B === "fills" ? (
            <Placeholder title="Fills" hint="Coming next: fill explanations." />
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
            <Placeholder title="Order entry" hint="Coming next: OCO / stop-limit." />
          ) : layout.slots.C === "orderbook" ? (
            <Placeholder title="Orderbook" hint="Coming next: depth ladder." />
          ) : layout.slots.C === "tape" ? (
            <Placeholder title="Tape" hint="Coming next: executions." />
          ) : layout.slots.C === "openOrders" ? (
            <Placeholder title="Open orders" hint="Coming next: cancel + status." />
          ) : layout.slots.C === "fills" ? (
            <Placeholder title="Fills" hint="Coming next: fees/slippage." />
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
            <Placeholder title="Order entry" hint="Coming next: limit/market." />
          ) : layout.slots.D === "orderbook" ? (
            <Placeholder title="Orderbook" hint="Coming next: depth." />
          ) : layout.slots.D === "tape" ? (
            <Placeholder title="Tape" hint="Coming next: executions." />
          ) : layout.slots.D === "openOrders" ? (
            <Placeholder title="Open orders" hint="Coming next: cancel." />
          ) : layout.slots.D === "fills" ? (
            <Placeholder title="Fills" hint="Coming next: details." />
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
