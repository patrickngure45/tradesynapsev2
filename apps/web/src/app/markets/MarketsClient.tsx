"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import { ApiErrorBanner, type ClientApiError } from "@/components/ApiErrorBanner";
import { fromBigInt3818, toBigInt3818 } from "@/lib/exchange/fixed3818";
import { MarketRegimeWidget } from "../arbitrage/MarketRegimeWidget";

type Market = {
  id: string;
  chain: string;
  symbol: string;
  status: string;
  tick_size: string;
  lot_size: string;
  maker_fee_bps: number;
  taker_fee_bps: number;
};

type MarketStats = {
  open: string;
  last: string;
  high: string;
  low: string;
  volume: string;
  quote_volume: string | null;
  vwap: string | null;
  trade_count: number;
};

type MarketStatsResponse = {
  market: { id: string; symbol: string; status: string };
  window_hours: number;
  stats: MarketStats | null;
  ts: string;
};

function digitsFromStep(step: string | null | undefined, fallback = 6, maxDigits = 10): number {
  if (!step) return fallback;
  const s = step.trim();
  if (!s) return fallback;
  if (/[eE]/.test(s)) return fallback;
  const dot = s.indexOf(".");
  if (dot === -1) return 0;
  const frac = s.slice(dot + 1).replace(/0+$/, "");
  const digits = frac.length;
  if (!Number.isFinite(digits)) return fallback;
  return Math.max(0, Math.min(maxDigits, digits));
}

function formatDecimal(value: string, digits: number) {
  if (!Number.isFinite(digits) || digits < 0) return value;
  const [i, f = ""] = value.split(".");
  if (digits === 0) return i;
  return `${i}.${(f + "0".repeat(digits)).slice(0, digits)}`;
}

function getChangeDisplay(stats: MarketStats): { text: string; arrow: string; className: string } {
  try {
    const openBi = toBigInt3818(stats.open);
    const lastBi = toBigInt3818(stats.last);
    if (openBi === 0n) return { text: "—", arrow: "", className: "" };

    const deltaBi = lastBi - openBi;
    const up = deltaBi >= 0n;
    const absDelta = up ? deltaBi : -deltaBi;

    // percent (fixed 18dp) = absDelta/open * 100
    const pctBi = (absDelta * 100n * 10n ** 18n) / openBi;
    const pctStr = fromBigInt3818(pctBi);
    const arrow = up ? "▲" : "▼";
    const className = up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
    const sign = up ? "+" : "-";
    return { text: `${sign}${formatDecimal(pctStr, 2)}%`, arrow, className };
  } catch {
    return { text: "—", arrow: "", className: "" };
  }
}

type Ticker = {
  market_id: string;
  symbol: string;
  open: string | null;
  last: string | null;
  high: string | null;
  low: string | null;
  volume: string | null;
  quote_volume: string | null;
  trade_count: number;
};

async function fetchAllTickers(): Promise<Record<string, MarketStats>> {
  const url = "/api/exchange/tickers";
  const resp = await fetchJsonOrThrow<{ tickers: Ticker[] }>(url, { cache: "no-store" });
  const out: Record<string, MarketStats> = {};
  for (const t of resp.tickers) {
    let vwap: string | null = null;
    try {
      const v = toBigInt3818(t.volume ?? "0");
      const q = toBigInt3818(t.quote_volume ?? "0");
      if (v > 0n) {
        // vwap = total_quote / total_base
        // result needs to be scaled by 1e18 for fromBigInt3818
        vwap = fromBigInt3818((q * (10n ** 18n)) / v);
      }
    } catch { }

    out[t.market_id] = {
      open: t.open ?? "0",
      last: t.last ?? "0",
      high: t.high ?? "0",
      low: t.low ?? "0",
      volume: t.volume ?? "0",
      quote_volume: t.quote_volume ?? "0",
      vwap,
      trade_count: t.trade_count
    };
  }
  return out;
}

export function MarketsClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [statsByMarketId, setStatsByMarketId] = useState<Record<string, MarketStats | null>>({});

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<
    "symbol" | "last" | "change" | "volume" | "trades"
  >("volume");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  const FAVORITES_LS_KEY = "pp_markets_favorites_v1";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const next = new Set<string>();
      for (const v of parsed) {
        if (typeof v === "string" && v) next.add(v);
      }
      setFavoriteIds(next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_LS_KEY, JSON.stringify(Array.from(favoriteIds)));
    } catch {
      // ignore
    }
  }, [favoriteIds]);

  async function refresh() {
    setLoading(true);
    setStatsLoading(true);
    setError(null);
    try {
      const [m, t] = await Promise.all([
        fetchJsonOrThrow<{ markets: Market[] }>("/api/exchange/markets", { cache: "no-store" }),
        fetchAllTickers()
      ]);
      setMarkets(m.markets ?? []);
      setStatsByMarketId(t);
    } catch (e) {
      if (e instanceof ApiError) setError({ code: e.code, details: e.details });
      else setError({ code: e instanceof Error ? e.message : String(e) });
    } finally {
      setStatsLoading(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(interval);
  }, []);

  function toggleFavorite(marketId: string) {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(marketId)) next.delete(marketId);
      else next.add(marketId);
      return next;
    });
  }

  function safeBi(value: string | null | undefined): bigint | null {
    try {
      if (value == null) return null;
      const s = value.trim();
      if (!s) return null;
      return toBigInt3818(s);
    } catch {
      return null;
    }
  }

  function changePpm(stats: MarketStats | null): bigint | null {
    try {
      if (!stats) return null;
      const openBi = safeBi(stats.open);
      const lastBi = safeBi(stats.last);
      if (!openBi || !lastBi) return null;
      if (openBi === 0n) return null;
      const delta = lastBi - openBi;
      return (delta * 1_000_000n) / openBi;
    } catch {
      return null;
    }
  }

  const filteredSorted = (() => {
    const q = query.trim().toLowerCase();
    const rows = markets.filter((m) => {
      if (favoritesOnly && !favoriteIds.has(m.id)) return false;
      if (!q) return true;
      return (
        m.symbol.toLowerCase().includes(q) ||
        m.chain.toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q)
      );
    });

    const withScore = rows.map((m, idx) => {
      const stats = statsByMarketId[m.id] ?? null;
      const last = safeBi(stats?.last);
      const vol = safeBi(stats?.volume);
      const trades = stats ? BigInt(stats.trade_count ?? 0) : null;
      const chg = changePpm(stats);
      const fav = favoriteIds.has(m.id);
      return { m, idx, fav, last, vol, trades, chg };
    });

    withScore.sort((a, b) => {
      // Favorites first for most sorts.
      if (a.fav !== b.fav) return a.fav ? -1 : 1;

      const cmpBigIntDescNullLast = (x: bigint | null, y: bigint | null) => {
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (x === y) return 0;
        return x > y ? -1 : 1;
      };

      const cmpStrAsc = (x: string, y: string) => x.localeCompare(y);

      if (sortKey === "volume") {
        const c = cmpBigIntDescNullLast(a.vol, b.vol);
        if (c !== 0) return c;
      } else if (sortKey === "change") {
        const c = cmpBigIntDescNullLast(a.chg, b.chg);
        if (c !== 0) return c;
      } else if (sortKey === "trades") {
        const c = cmpBigIntDescNullLast(a.trades, b.trades);
        if (c !== 0) return c;
      } else if (sortKey === "last") {
        const c = cmpBigIntDescNullLast(a.last, b.last);
        if (c !== 0) return c;
      } else if (sortKey === "symbol") {
        const c = cmpStrAsc(a.m.symbol, b.m.symbol);
        if (c !== 0) return c;
      }

      // Stable fallback: preserve original order.
      return a.idx - b.idx;
    });

    return withScore.map((r) => r.m);
  })();

  useEffect(() => {
    if (!filteredSorted.length) {
      if (selectedMarketId !== null) setSelectedMarketId(null);
      return;
    }

    if (!selectedMarketId || !filteredSorted.some((m) => m.id === selectedMarketId)) {
      setSelectedMarketId(filteredSorted[0]!.id);
    }
  }, [filteredSorted, selectedMarketId]);

  function openMarket(marketId: string) {
    router.push(`/exchange?market_id=${encodeURIComponent(marketId)}`);
  }

  function onTableKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!filteredSorted.length) return;

    const key = e.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter") return;

    e.preventDefault();
    e.stopPropagation();

    const idx = selectedMarketId ? filteredSorted.findIndex((m) => m.id === selectedMarketId) : -1;
    const cur = idx >= 0 ? idx : 0;

    if (key === "Enter") {
      const m = filteredSorted[cur];
      if (!m) return;
      openMarket(m.id);
      return;
    }

    const dir = key === "ArrowDown" ? 1 : -1;
    const next = Math.max(0, Math.min(filteredSorted.length - 1, cur + dir));
    const nextId = filteredSorted[next]!.id;
    setSelectedMarketId(nextId);
  }

  const sortHint = (() => {
    if (sortKey === "volume") return "24h vol";
    if (sortKey === "change") return "24h %";
    if (sortKey === "trades") return "Trades";
    if (sortKey === "last") return "Last";
    return "Symbol";
  })();

  const topMovers = useMemo(() => {
     const all = markets.map(m => {
        const stats = statsByMarketId[m.id];
        const chg = changePpm(stats);
        return { m, stats, chg: Number(chg || 0n) };
     });
     // Sort by change (filtering out inactive markets if possible, or just strict sort)
     const sorted = [...all].sort((a,b) => b.chg - a.chg);
     // Filter out things with zero volume to avoid noise?
     const active = sorted.filter(x => x.stats && toBigInt3818(x.stats?.volume || "0") > 0n);
     
     return {
        gainers: active.slice(0, 3),
        losers: active.slice(-3).reverse()
     };
   }, [markets, statsByMarketId]);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Intelligence Dashboard */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <MarketRegimeWidget symbol="BTC/USDT" />
         <MarketRegimeWidget symbol="ETH/USDT" />
         
         {/* Top Gainers */}
         <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm hover:border-[var(--accent)]/30 transition">
             <h3 className="text-xs font-bold uppercase text-[var(--muted)] mb-3 tracking-wider">Top Gainers (24h)</h3>
             <div className="space-y-3">
                {topMovers.gainers.map((item) => (
                   <Link href={`/exchange?market_id=${encodeURIComponent(item.m.id)}`} key={item.m.id} className="flex items-center justify-between group">
                      <div className="font-semibold text-sm group-hover:text-[var(--accent)] transition">{item.m.symbol}</div>
                      <div className="font-mono text-xs font-bold text-[var(--up)] bg-[var(--up-bg)] px-1.5 py-0.5 rounded">
                         +{(item.chg / 10000).toFixed(2)}%
                      </div>
                   </Link>
                ))}
                {topMovers.gainers.length === 0 && <div className="text-xs text-[var(--muted)] italic">No active gainers</div>}
             </div>
         </div>

         {/* Top Losers */}
         <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm hover:border-[var(--accent)]/30 transition">
             <h3 className="text-xs font-bold uppercase text-[var(--muted)] mb-3 tracking-wider">Top Losers (24h)</h3>
             <div className="space-y-3">
                {topMovers.losers.map((item) => (
                   <Link href={`/exchange?market_id=${encodeURIComponent(item.m.id)}`} key={item.m.id} className="flex items-center justify-between group">
                      <div className="font-semibold text-sm group-hover:text-[var(--accent)] transition">{item.m.symbol}</div>
                      <div className="font-mono text-xs font-bold text-[var(--down)] bg-[var(--down-bg)] px-1.5 py-0.5 rounded">
                         {(item.chg / 10000).toFixed(2)}%
                      </div>
                   </Link>
                ))}
                {topMovers.losers.length === 0 && <div className="text-xs text-[var(--muted)] italic">No active losers</div>}
             </div>
         </div>
      </div>

    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Spot markets</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Tick/lot sizes and fees come from the exchange config.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_80%,transparent)] px-3 py-2 text-xs">
            <span className="text-[var(--muted)]">Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="BTC, chain, status…"
              className="w-44 bg-transparent text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_80%,transparent)] px-3 py-2 text-xs">
            <span className="text-[var(--muted)]">Sort</span>
            <select
              className="bg-transparent text-xs text-[var(--foreground)] focus:outline-none"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            >
              <option value="volume">24h vol</option>
              <option value="change">24h %</option>
              <option value="trades">Trades</option>
              <option value="last">Last</option>
              <option value="symbol">Symbol</option>
            </select>
          </label>

          <button
            type="button"
            className={`rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium ${
              favoritesOnly
                ? "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white"
                : "bg-[color-mix(in_srgb,var(--card)_80%,transparent)] text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--card)_92%,transparent)]"
            }`}
            onClick={() => setFavoritesOnly((v) => !v)}
            title="Toggle favorites"
          >
            ★ Favorites
          </button>

          <button
            type="button"
            className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_80%,transparent)] px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--card)_92%,transparent)] disabled:opacity-60"
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <div className="mt-3"><ApiErrorBanner error={error} /></div> : null}

      <div
        className="mt-4 overflow-x-auto rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        tabIndex={0}
        onKeyDown={onTableKeyDown}
        aria-label="Markets table (use arrow keys and Enter)"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
          <div>
            Tip: focus this table, then <span className="font-mono">↑</span>/<span className="font-mono">↓</span> to select, <span className="font-mono">Enter</span> to trade.
          </div>
          <div>
            Sorting: <span className="font-mono">{sortHint}</span>
          </div>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] text-[var(--muted)]">
            <tr>
              <th className="py-2 pl-1">Symbol</th>
              <th className="py-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
                  onClick={() => setSortKey("last")}
                  title="Sort by last"
                >
                  Last{sortKey === "last" ? " ▼" : ""}
                </button>
              </th>
              <th className="py-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
                  onClick={() => setSortKey("change")}
                  title="Sort by 24h change"
                >
                  24h{sortKey === "change" ? " ▼" : ""}
                </button>
              </th>
              <th className="py-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
                  onClick={() => setSortKey("volume")}
                  title="Sort by 24h volume"
                >
                  24h vol{sortKey === "volume" ? " ▼" : ""}
                </button>
              </th>
              <th className="py-2">VWAP</th>
              <th className="py-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
                  onClick={() => setSortKey("trades")}
                  title="Sort by trade count"
                >
                  Trades{sortKey === "trades" ? " ▼" : ""}
                </button>
              </th>
              <th className="py-2">Status</th>
              <th className="py-2">Tick</th>
              <th className="py-2">Lot</th>
              <th className="py-2">Maker</th>
              <th className="py-2">Taker</th>
              <th className="py-2 pr-1"></th>
            </tr>
          </thead>
          <tbody className="align-top">
            {filteredSorted.map((m) => {
              const stats = statsByMarketId[m.id] ?? null;
              const priceDigits = digitsFromStep(m.tick_size, 6, 10);
              const qtyDigits = digitsFromStep(m.lot_size, 6, 10);
              const change = stats ? getChangeDisplay(stats) : { text: statsLoading ? "…" : "—", arrow: "", className: "" };

              const lastText = stats?.last ? formatDecimal(stats.last, priceDigits) : statsLoading ? "…" : "—";
              const volText = stats?.volume ? formatDecimal(stats.volume, qtyDigits) : statsLoading ? "…" : "—";
              const vwapText = stats?.vwap ? formatDecimal(stats.vwap, priceDigits) : statsLoading ? "…" : "—";
              const tradesText = stats ? String(stats.trade_count ?? 0) : statsLoading ? "…" : "—";

              const statusTone =
                m.status === "active"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-[color-mix(in_srgb,var(--muted)_18%,transparent)] text-[var(--muted)]";

              const isFav = favoriteIds.has(m.id);
              const selected = selectedMarketId === m.id;

              return (
                <tr
                  key={m.id}
                  className={`border-t border-[var(--border)] ${
                    selected
                      ? "bg-[color-mix(in_srgb,var(--card)_92%,transparent)]"
                      : "hover:bg-[color-mix(in_srgb,var(--card)_88%,transparent)]"
                  } cursor-pointer`}
                  onClick={() => openMarket(m.id)}
                  onMouseEnter={() => setSelectedMarketId(m.id)}
                  title="Click to trade"
                >
                  <td className="py-2 pl-1 font-mono">
                    <span className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] text-[11px] ${
                          isFav
                            ? "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white"
                            : "bg-[color-mix(in_srgb,var(--card)_80%,transparent)] text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--card)_92%,transparent)]"
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite(m.id);
                        }}
                        title={isFav ? "Unfavorite" : "Favorite"}
                        aria-label={isFav ? "Unfavorite market" : "Favorite market"}
                      >
                        ★
                      </button>
                      <span className="h-1.5 w-1.5 rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-2))]" aria-hidden />
                      {m.symbol}
                    </span>
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {m.chain}
                    </div>
                  </td>
                  <td className="py-2 font-mono">{lastText}</td>
                  <td className={`py-2 font-mono ${change.className}`}>
                    {change.arrow ? <span className="mr-1">{change.arrow}</span> : null}
                    {change.text}
                  </td>
                  <td className="py-2 font-mono">{volText}</td>
                  <td className="py-2 font-mono">{vwapText}</td>
                  <td className="py-2 font-mono">{tradesText}</td>
                  <td className="py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${statusTone}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="py-2 font-mono">{m.tick_size}</td>
                  <td className="py-2 font-mono">{m.lot_size}</td>
                  <td className="py-2 font-mono">{m.maker_fee_bps} bps</td>
                  <td className="py-2 font-mono">{m.taker_fee_bps} bps</td>
                  <td className="py-2 pr-1">
                    <Link
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_82%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--card)_95%,transparent)]"
                      href={`/exchange?market_id=${encodeURIComponent(m.id)}`}
                      title="Open Spot trading"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Trade
                    </Link>
                  </td>
                </tr>
              );
            })}

            {filteredSorted.length === 0 && !loading ? (
              <tr>
                <td colSpan={12} className="py-6 text-center text-sm text-[var(--muted)]">
                  No markets{query.trim() || favoritesOnly ? " match your filters" : ""}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
    </div>
  );
}
