"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ArbitrageOpportunityRow } from "./ArbitrageOpportunityRow";

/* ── Types ──────────────────────────────────────────────────────────── */

type PriceEntry = { bid: string; ask: string; ts: string };
type PriceMap = Record<string, Record<string, PriceEntry>>;
type ArbOpp = {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyAsk: number;
  sellBid: number;
  spreadPct: number;
  potentialProfit: number;
  netSpreadPct: number;
  netProfit: number;
  notionalUsd?: number;
  execNotionalUsd?: number;
  grossProfitUsd?: number;
  netProfitUsd?: number;
  grossProfitExecUsd?: number;
  netProfitExecUsd?: number;
  readiness?: {
    state: "discoverable" | "action_required" | "executable";
    canExecute: boolean;
    reasons: string[];
  };
  ts: string;
};

type IndexSource = { exchange: string; mid: number | null; ts: number; error?: string };
type IndexOpp = {
  base: string;
  internalSymbol: string;
  internalBidUsdt: number;
  internalAskUsdt: number;
  internalMidUsdt: number;
  externalIndexUsdt: number;
  indexSourcesUsed: number;
  indexSources: IndexSource[];
  dispersionBps: number | null;
  deviationPct: number;
  direction: "buy_internal_sell_external" | "sell_internal_buy_external" | "none";
  ts: string;
};

type SortField = "spread" | "profit" | "symbol";

type ArbScannerMeta = {
  scannedExchanges: string[];
  trackedSymbols: string[];
  enabledAssetCount?: number;
  maxSymbols?: number;
  notionalUsd?: number;
};

type ArbOverview = {
  ts: string;
  symbols: { enabledCount: number; scanned: string[]; scannedCount: number; maxSymbols: number };
  venues: { connected: string[]; scanned?: string[]; mode?: "connected" | "public" };
  gates?: {
    api?: { ok: boolean; connectedCount: number };
  };
  sizing: {
    minUsd: number;
    capUsd: number;
    notionalUsd: number;
  };
  external: {
    banner?: { tone: "error" | "warning"; code: string; message: string } | null;
    opportunities: ArbOpp[];
    prices: PriceMap;
    errors?: any[];
  };
  index: { minDevPct: number; opportunities: IndexOpp[] };
};

type BannerTone = "error" | "warning";
type ApiErrorPayload = {
  error?: string;
  message?: string;
  external?: {
    banner?: {
      tone?: BannerTone;
      message?: string;
    } | null;
  };
};

/* ── Helpers ────────────────────────────────────────────────────────── */

const EXCHANGE_META: Record<string, { label: string; color: string }> = {
  binance: { label: "Binance", color: "#f0b90b" },
  bybit: { label: "Bybit", color: "#f7a600" },
  okx: { label: "OKX", color: "#fff" },
  kucoin: { label: "KuCoin", color: "var(--accent)" },
  gateio: { label: "Gate.io", color: "var(--accent-2)" },
  bitget: { label: "Bitget", color: "var(--warn)" },
  mexc: { label: "MEXC", color: "var(--accent)" },
  tradesynapse: { label: "TradeSynapse", color: "var(--accent)" },
};

function exchangeLabel(ex: string) {
  return EXCHANGE_META[ex]?.label ?? ex;
}

function exchangeColor(ex: string) {
  return EXCHANGE_META[ex]?.color ?? "var(--muted)";
}

function spreadTier(pct: number): { label: string; class: string } {
  if (pct >= 1.0) return { label: "HOT", class: "bg-[var(--up)]/20 text-[var(--up)]" };
  if (pct >= 0.5) return { label: "WARM", class: "bg-yellow-500/20 text-yellow-400" };
  return { label: "COOL", class: "bg-blue-500/20 text-blue-400" };
}

function deduplicateOpps(list: ArbOpp[]): ArbOpp[] {
  const unique = new Map<string, ArbOpp>();
  list.forEach((o) => {
    const key = `${o.symbol}:${o.buyExchange}:${o.sellExchange}`;
    // Keep the one with highest spread
    if (!unique.has(key) || o.spreadPct > unique.get(key)!.spreadPct) {
      unique.set(key, o);
    }
  });
  return Array.from(unique.values());
}

function resolveApiErrorMessage(data: ApiErrorPayload | null, fallback: string) {
  const bannerMsg = data?.external?.banner?.message;
  if (typeof bannerMsg === "string" && bannerMsg.trim()) return bannerMsg.trim();

  if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
  if (typeof data?.error === "string" && data.error.trim()) {
    const code = data.error.trim();
    if (code === "user_not_found" || code === "missing_x_user_id") {
      return "Sign in to run the scanner.";
    }
    if (code === "inactive_user") {
      return "Your account is not active for scanning yet.";
    }
    return code;
  }

  return fallback;
}

function resolveApiErrorTone(status: number, data: ApiErrorPayload | null): BannerTone {
  const tone = data?.external?.banner?.tone;
  if (tone === "warning" || tone === "error") return tone;
  return status >= 500 ? "error" : "warning";
}

/* ── Mini bar visualization ─────────────────────────────────────────── */

function SpreadBar({ pct, max }: { pct: number; max: number }) {
  const width = max > 0 ? Math.min((pct / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--border)]">
      <div
        className="h-full rounded-full bg-[var(--up)] transition-all duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/* ── Pulse dot for scanning ─────────────────────────────────────────── */

function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--up)] opacity-50" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--up)]" />
    </span>
  );
}

/* ── Component ──────────────────────────────────────────────────────── */

export function ArbitrageClient({ userId }: { userId: string | null }) {
  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "1";

  const [prices, setPrices] = useState<PriceMap>({});
  const [opps, setOpps] = useState<ArbOpp[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [connections, setConnections] = useState<string[]>([]); // list of connected exchange IDs (binance, bybit)
  const [indexOpps, setIndexOpps] = useState<IndexOpp[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [autoScan, setAutoScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTone, setErrorTone] = useState<BannerTone>("error");
  const [scanCount, setScanCount] = useState(0);
  const [scannerMeta, setScannerMeta] = useState<ArbScannerMeta | null>(null);
  const [gates, setGates] = useState<ArbOverview["gates"] | null>(null);

  const oppExchanges = Array.from(new Set(opps.flatMap((o) => [o.buyExchange, o.sellExchange])));

  // Filters & sort
  const [minSpread, setMinSpread] = useState(0);
  const [sortField, setSortField] = useState<SortField>("spread");
  const [showPrices, setShowPrices] = useState(true);

  // Fetch connections
  const fetchConnections = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/exchange/connections", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const connectedExchanges = (data.connections || []).map((c: any) => c.exchange);
        setConnections(connectedExchanges);
      }
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const fetchLatest = useCallback(async () => {
    try {
      const url = debug
        ? "/api/exchange/arbitrage/overview?action=latest&debug=1"
        : "/api/exchange/arbitrage/overview?action=latest";
      const res = await fetch(url, { credentials: "include" });
      const data = (await res.json().catch(() => null)) as (ArbOverview & ApiErrorPayload) | null;
      if (!res.ok || !data) {
        const msg = resolveApiErrorMessage(data, "Failed to load arbitrage data");
        const tone = resolveApiErrorTone(res.status, data);
        setError(msg);
        setErrorTone(tone);
        setGates(null);
        return;
      }
      setPrices(data.external?.prices ?? {});
      setOpps(deduplicateOpps(data.external?.opportunities ?? []));
      setIndexOpps(Array.isArray(data.index?.opportunities) ? data.index.opportunities : []);
      setSymbols(Object.keys(data.external?.prices ?? {}));

      const scanned = Array.isArray(data.venues?.scanned) ? data.venues.scanned : (Array.isArray(data.venues?.connected) ? data.venues.connected : []);
      setScannerMeta({
        scannedExchanges: scanned,
        trackedSymbols: Array.isArray(data.symbols?.scanned) ? data.symbols.scanned : [],
        enabledAssetCount: data.symbols?.enabledCount,
        maxSymbols: data.symbols?.maxSymbols,
        notionalUsd: data.sizing?.notionalUsd,
      });
      setLastUpdate(data.ts);
      setGates(data.gates ?? null);
      const banner = data.external?.banner ?? null;
      setError(banner?.message ?? null);
      setErrorTone((banner?.tone as BannerTone) ?? "error");
    } catch {
      setError("Failed to load arbitrage data");
      setErrorTone("error");
      setGates(null);
    }
  }, [debug]);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    try {
      const url = debug
        ? "/api/exchange/arbitrage/overview?action=scan&debug=1"
        : "/api/exchange/arbitrage/overview?action=scan";
      const res = await fetch(url, { credentials: "include" });
      const data = (await res.json().catch(() => null)) as (ArbOverview & ApiErrorPayload) | null;
      if (!res.ok || !data) {
        const msg = resolveApiErrorMessage(data, "Scan failed");
        const tone = resolveApiErrorTone(res.status, data);
        setError(msg);
        setErrorTone(tone);
        setGates(null);
        return;
      }
      setPrices(data.external?.prices ?? {});
      setOpps(deduplicateOpps(data.external?.opportunities ?? []));
      setIndexOpps(Array.isArray(data.index?.opportunities) ? data.index.opportunities : []);
      setSymbols(Object.keys(data.external?.prices ?? {}));

      const scanned = Array.isArray(data.venues?.scanned) ? data.venues.scanned : (Array.isArray(data.venues?.connected) ? data.venues.connected : []);
      setScannerMeta({
        scannedExchanges: scanned,
        trackedSymbols: Array.isArray(data.symbols?.scanned) ? data.symbols.scanned : [],
        enabledAssetCount: data.symbols?.enabledCount,
        maxSymbols: data.symbols?.maxSymbols,
        notionalUsd: data.sizing?.notionalUsd,
      });
      setLastUpdate(data.ts);
      setScanCount((c) => c + 1);
      setGates(data.gates ?? null);
      const banner = data.external?.banner ?? null;
      setError(banner?.message ?? null);
      setErrorTone((banner?.tone as BannerTone) ?? "error");
    } catch {
      setError("Scan failed");
      setErrorTone("error");
      setGates(null);
    } finally {
      setScanning(false);
    }
  }, [debug]);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  useEffect(() => {
    if (!autoScan) return;
    const interval = setInterval(triggerScan, 15_000);
    return () => clearInterval(interval);
  }, [autoScan, triggerScan]);

  /* Derived */
  const maxSpread = opps.reduce((m, o) => Math.max(m, o.netSpreadPct ?? 0), 0);
  const avgSpread =
    opps.length > 0
      ? opps.reduce((s, o) => s + (o.netSpreadPct ?? 0), 0) / opps.length
      : 0;
  // Only sum up profitable opps for the user's notional (still a heuristic)
  const totalNetProfitUsd = opps.reduce((s, o) => s + Math.max(0, o.netProfitExecUsd ?? o.netProfitUsd ?? 0), 0);

  const filteredOpps = [...opps]
    .filter((o) => o.spreadPct >= minSpread)
    .sort((a, b) => {
      switch (sortField) {
        case "spread":
          return b.spreadPct - a.spreadPct;
        case "profit":
          return (b.netProfitExecUsd ?? b.netProfitUsd ?? b.potentialProfit) - (a.netProfitExecUsd ?? a.netProfitUsd ?? a.potentialProfit);
        case "symbol":
          return a.symbol.localeCompare(b.symbol);
      }
    });

  return (
    <div className="space-y-6">
      {/* ── Strategy Overview ───────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Strategies</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              We prioritize strategies that are executable and transparent.
            </p>
          </div>
          <div className="text-xs text-[var(--muted)]">
            Execution support: <span className="font-medium text-[var(--foreground)]">Binance, Bybit</span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-xs font-semibold">Cross‑Exchange Spot</div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">
              Compare bid/ask across exchanges and surface gross spreads on liquid USDT pairs.
            </div>
            <div className="mt-2 inline-flex rounded-full bg-[var(--up)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--up)]">
              Enabled
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-xs font-semibold">Triangular (Single‑Exchange)</div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">
              Requires orderbook depth + fee modeling to avoid false positives.
            </div>
            <div className="mt-2 inline-flex rounded-full bg-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
              Coming soon
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-xs font-semibold">Funding / Carry (Perps)</div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">
              Advanced, market‑neutral setups with liquidation + basis risk.
            </div>
            <div className="mt-2 inline-flex rounded-full bg-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
              Coming soon
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] text-[var(--muted)]">
          We show <span className="font-medium text-[var(--foreground)]">net spread</span> estimates (fees + slippage + delay).
          Real execution depends on balances, limits, and speed.
        </div>

        {scannerMeta && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Sizing used</div>
              <div className="mt-1 text-sm font-semibold">
                ${(scannerMeta.notionalUsd ?? 0).toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Coverage</div>
              <div className="mt-1 text-sm font-semibold">
                {scannerMeta.scannedExchanges.length} venues
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                {scannerMeta.trackedSymbols.length} symbols scanned (cap {scannerMeta.maxSymbols ?? "—"})
              </div>
            </div>
          </div>
        )}

        {debug && scannerMeta && (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] text-[var(--muted)]">
            <div className="font-semibold text-[var(--foreground)]">Debug</div>
            <div className="mt-1">
              Scanned: {scannerMeta.scannedExchanges.length > 0
                ? scannerMeta.scannedExchanges.map(exchangeLabel).join(", ")
                : "—"}
            </div>
            <div>
              Opportunities: {oppExchanges.length > 0
                ? oppExchanges.map(exchangeLabel).join(", ")
                : "—"}
            </div>
          </div>
        )}
      </div>

      {/* ── Controls ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={triggerScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent)]/80 disabled:opacity-50"
        >
          {scanning ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-25"
                />
                <path
                  d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z"
                  fill="currentColor"
                  className="opacity-75"
                />
              </svg>
              Scanning...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Scan Now
            </>
          )}
        </button>

        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={autoScan}
            onChange={(e) => setAutoScan(e.target.checked)}
            className="rounded accent-[var(--accent)]"
          />
          <span className="text-xs">Auto-scan</span>
          {autoScan && <PulseDot />}
        </label>

        {/* Min spread filter */}
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          Min spread
          <select
            value={minSpread}
            onChange={(e) => setMinSpread(parseFloat(e.target.value))}
            className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
          >
            <option value={0}>All</option>
            <option value={0.1}>≥ 0.1%</option>
            <option value={0.25}>≥ 0.25%</option>
            <option value={0.5}>≥ 0.5%</option>
            <option value={1}>≥ 1.0%</option>
          </select>
        </label>

        {lastUpdate && (
          <span className="ml-auto text-xs text-[var(--muted)]">
            Updated {new Date(lastUpdate).toLocaleTimeString()}
            {scanCount > 0 && ` · ${scanCount} scans`}
          </span>
        )}
      </div>

      {error && (
        <div
          className={
            errorTone === "warning"
              ? "rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-200"
              : "rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400"
          }
        >
          {errorTone === "warning" ? "Action:" : "Blocked:"} {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-xs underline opacity-70 hover:opacity-100"
          >
            · dismiss
          </button>
        </div>
      )}

      {/* ── Summary Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Opportunities",
            value: filteredOpps.length,
            sub: `of ${opps.length} total`,
            icon: "🎯",
          },
          {
            label: "Best Net Spread",
            value: maxSpread > 0 ? `${maxSpread.toFixed(3)}%` : "—",
            sub: maxSpread >= 0.5 ? "Hot" : maxSpread >= 0.2 ? "Warm" : "Cool",
            icon: "🔥",
          },
          {
            label: "Avg Net Spread",
            value: avgSpread > 0 ? `${avgSpread.toFixed(4)}%` : "—",
            sub: `across ${opps.length} routes`,
            icon: "📊",
          },
          {
            label: "Net Profit",
            value: totalNetProfitUsd > 0 ? `$${totalNetProfitUsd.toFixed(2)}` : "—",
            sub: "user sizing",
            icon: "💰",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-center"
          >
            <div className="text-lg">{stat.icon}</div>
            <div className="mt-1 text-lg font-bold">{stat.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {stat.label}
            </div>
            <div className="mt-0.5 text-[9px] text-[var(--muted)]">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Opportunities ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Arbitrage Opportunities</h3>
            {filteredOpps.length > 0 && (
              <span className="rounded-full bg-[var(--up)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--up)]">
                {filteredOpps.length} found
              </span>
            )}
          </div>
          {/* Sort control */}
          <div className="flex rounded-lg border border-[var(--border)] text-[10px]">
            {(
              [
                ["spread", "Spread"],
                ["profit", "Profit"],
                ["symbol", "Symbol"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortField(key)}
                className={`px-2.5 py-1 transition first:rounded-l-lg last:rounded-r-lg ${
                  sortField === key
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredOpps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="text-3xl">🔍</div>
            <p className="text-sm text-[var(--muted)]">
              {opps.length === 0
                ? "No arbitrage opportunities detected. Run a scan to check cross-exchange prices."
                : "No opportunities match your minimum spread filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOpps.slice(0, 50).map((opp, i) => (
              <ArbitrageOpportunityRow 
                key={`${opp.symbol}-${opp.buyExchange}-${opp.sellExchange}-${i}`}
                opp={opp}
                connectedExchanges={connections}
                onConnectAction={fetchConnections}
              />
            ))}
            {filteredOpps.length > 50 && (
              <div className="pt-2 text-center text-xs text-[var(--muted)]">
                Showing top 50 highly profitable opportunities (of {filteredOpps.length} total)
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── TradeSynapse vs External Index ──────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">TradeSynapse vs External Index</h3>
            {indexOpps.length > 0 && (
              <span className="rounded-full bg-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                {indexOpps.length} signals
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--muted)]">External index is median across exchanges</div>
        </div>

        {indexOpps.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--muted)]">No index signals yet (scan to compute).</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 pr-4 text-right">Internal Mid (USDT)</th>
                  <th className="pb-2 pr-4 text-right">Index (USDT)</th>
                  <th className="pb-2 pr-4 text-right">Deviation</th>
                  <th className="pb-2 pr-4">Sources</th>
                  <th className="pb-2 text-right">Dispersion</th>
                </tr>
              </thead>
              <tbody>
                {[...indexOpps]
                  .sort((a, b) => Math.abs(b.deviationPct) - Math.abs(a.deviationPct))
                  .slice(0, 25)
                  .map((s) => {
                    const dev = s.deviationPct;
                    const devClass = dev >= 0.25 ? "text-red-400" : dev <= -0.25 ? "text-[var(--up)]" : "text-[var(--muted)]";
                    const exchangesUsed = (s.indexSources || [])
                      .filter((x) => !x.error && typeof x.mid === "number")
                      .map((x) => exchangeLabel(String(x.exchange)))
                      .slice(0, 4);
                    return (
                      <tr key={s.base} className="border-b border-[var(--border)]/30 transition hover:bg-[var(--accent)]/5">
                        <td className="py-2.5 pr-4 font-mono font-medium">{s.base}/USDT</td>
                        <td className="py-2.5 pr-4 text-right font-mono">{s.internalMidUsdt.toFixed(4)}</td>
                        <td className="py-2.5 pr-4 text-right font-mono">{s.externalIndexUsdt.toFixed(4)}</td>
                        <td className={`py-2.5 pr-4 text-right font-mono font-semibold ${devClass}`}>{dev > 0 ? "+" : ""}{dev.toFixed(3)}%</td>
                        <td className="py-2.5 pr-4 text-[11px] text-[var(--muted)]">
                          {exchangesUsed.length ? exchangesUsed.join(", ") : "—"}
                          {s.indexSourcesUsed ? ` (${s.indexSourcesUsed})` : ""}
                        </td>
                        <td className="py-2.5 text-right font-mono text-[11px] text-[var(--muted)]">
                          {typeof s.dispersionBps === "number" ? `${s.dispersionBps.toFixed(0)} bps` : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Cross-Exchange Prices ──────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <button
          onClick={() => setShowPrices(!showPrices)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <h3 className="text-sm font-medium">
            Cross-Exchange Prices
            {symbols.length > 0 && (
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                {symbols.length} symbols ·{" "}
                {Object.values(prices).reduce(
                  (sum, exs) => sum + Object.keys(exs).length,
                  0,
                )}{" "}
                feeds
              </span>
            )}
          </h3>
          <svg
            className={`h-4 w-4 text-[var(--muted)] transition ${showPrices ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {showPrices && (
          <div className="border-t border-[var(--border)] p-4">
            {symbols.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--muted)]">
                No price data yet. Run a scan first.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      <th className="pb-2 pr-4">Symbol</th>
                      <th className="pb-2 pr-4">Exchange</th>
                      <th className="pb-2 pr-4 text-right">Bid</th>
                      <th className="pb-2 pr-4 text-right">Ask</th>
                      <th className="pb-2 text-right">Spread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {symbols.flatMap((symbol) => {
                      const exchanges = prices[symbol];
                      if (!exchanges) return [];

                      return Object.entries(exchanges).map(([exchange, entry], eIdx) => {
                        const bid = parseFloat(entry.bid);
                        const ask = parseFloat(entry.ask);
                        const spread =
                          ask > 0 ? (((ask - bid) / ask) * 100).toFixed(3) : "—";
                        const spreadNum = ask > 0 ? ((ask - bid) / ask) * 100 : 0;

                        return (
                          <tr
                            key={`${symbol}-${exchange}`}
                            className="border-b border-[var(--border)]/30 transition hover:bg-[var(--accent)]/5"
                          >
                            <td className="py-2.5 pr-4 font-mono font-medium">
                              {eIdx === 0 ? symbol : ""}
                            </td>
                            <td className="py-2.5 pr-4">
                              <span
                                className="inline-flex items-center gap-1.5"
                                style={{ color: exchangeColor(exchange) }}
                              >
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: exchangeColor(exchange) }}
                                />
                                {exchangeLabel(exchange)}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono text-[var(--up)]">
                              {bid.toFixed(4)}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono text-[var(--down)]">
                              {ask.toFixed(4)}
                            </td>
                            <td className="py-2.5 text-right">
                              <span
                                className={`font-mono text-xs ${
                                  spreadNum > 0.5
                                    ? "text-[var(--up)]"
                                    : spreadNum > 0.2
                                      ? "text-yellow-400"
                                      : "text-[var(--muted)]"
                                }`}
                              >
                                {spread}%
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
