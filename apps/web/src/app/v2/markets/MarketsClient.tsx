"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Skeleton } from "@/components/v2/Skeleton";

type MarketOverviewRow = {
  id: string;
  chain: string;
  symbol: string;
  status: string;
  is_halted: boolean;
  base_symbol: string;
  quote_symbol: string;
  stats: null | {
    open: string;
    last: string;
    high: string;
    low: string;
    volume: string;
    quote_volume: string;
    trade_count: number;
  };
};

type MarketsOverviewResponse = {
  fiat: string;
  markets: MarketOverviewRow[];
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

function readFavs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("cw:v2:favMarkets") ?? "";
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as any[]).map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeFavs(ids: string[]) {
  try {
    localStorage.setItem("cw:v2:favMarkets", JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function MarketsClient() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketOverviewRow[]>([]);
  const [favs, setFavs] = useState<string[]>(() => readFavs());

  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    if (markets.length === 0) setLoading(true);
    try {
      const res = await fetch("/api/exchange/markets/overview?fiat=USD", { cache: "no-store", signal: controller.signal });
      const json = (await res.json().catch(() => null)) as MarketsOverviewResponse | null;
      if (!res.ok) throw new Error("markets_unavailable");
      const rows = Array.isArray(json?.markets) ? json!.markets : [];
      // v1: USDT quote only
      if (seq !== loadSeqRef.current) return;
      setMarkets(rows.filter((m) => String(m.quote_symbol).toUpperCase() === "USDT"));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // If we already have data, keep it; don't wipe the UI on transient refresh errors.
      if (seq !== loadSeqRef.current) return;
      if (markets.length === 0) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void load();
    };
    const id = window.setInterval(tick, 15_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedQuery = query.trim().toUpperCase();

  const showError = Boolean(error) && markets.length === 0;

  const movers = useMemo(() => {
    const base = markets
      .map((m) => {
        const open = m.stats?.open ?? null;
        const last = m.stats?.last ?? null;
        const chg = pctChange(open, last);
        return { m, changePct: chg };
      })
      .filter((x) => x.changePct != null);

    const sorted = base
      .slice()
      .sort((a, b) => {
        const aa = a.changePct ?? -Infinity;
        const bb = b.changePct ?? -Infinity;
        return bb - aa;
      });

    const gainers = sorted.slice(0, 3);
    const losers = sorted.slice().reverse().slice(0, 3);
    return { gainers, losers };
  }, [markets]);

  const rows = useMemo(() => {
    const base = markets
      .map((m) => {
        const open = m.stats?.open ?? null;
        const last = m.stats?.last ?? null;
        const chg = pctChange(open, last);
        const fav = favs.includes(m.id);
        return {
          ...m,
          open,
          last,
          changePct: chg,
          isFav: fav,
        };
      })
      .filter((m) => {
        if (!normalizedQuery) return true;
        const sym = `${String(m.base_symbol).toUpperCase()}/${String(m.quote_symbol).toUpperCase()}`;
        return sym.includes(normalizedQuery) || String(m.symbol).toUpperCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        // Favorites first
        if (a.isFav !== b.isFav) return a.isFav ? -1 : 1;
        // Then by absolute 24h move (descending)
        const am = a.changePct == null ? -1 : Math.abs(a.changePct);
        const bm = b.changePct == null ? -1 : Math.abs(b.changePct);
        if (am !== bm) return bm - am;
        return String(a.symbol).localeCompare(String(b.symbol));
      });

    return base;
  }, [markets, favs, normalizedQuery]);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeFavs(next);
      return next;
    });
  };

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Markets</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Trade USDT pairs</h1>
        <p className="text-sm text-[var(--v2-muted)]">Search, favorite, and open a market to trade.</p>
      </header>

      <V2Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search BTC, ETH, BTC/USDT…"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      {!error && !loading && !normalizedQuery && (movers.gainers.length || movers.losers.length) ? (
        <section className="grid gap-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Movers</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-3 shadow-[var(--v2-shadow-sm)]">
              <div className="text-[12px] font-semibold text-[var(--v2-text)]">Top gainers</div>
              <div className="mt-2 grid gap-2">
                {movers.gainers.map(({ m, changePct }) => {
                  const base = String(m.base_symbol).toUpperCase();
                  const quote = String(m.quote_symbol).toUpperCase();
                  const label = `${base}/${quote}`;
                  const c = changePct ?? 0;
                  const t = `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`;
                  return (
                    <Link
                      key={m.id}
                      href={`/v2/trade?base=${encodeURIComponent(base)}&quote=${encodeURIComponent(quote)}`}
                      className="flex items-center justify-between gap-2 rounded-xl bg-[var(--v2-surface-2)] px-2 py-2"
                    >
                      <div className="text-[12px] font-semibold text-[var(--v2-text)]">{label}</div>
                      <div className="text-[12px] font-semibold text-[var(--v2-up)]">{t}</div>
                    </Link>
                  );
                })}
                {movers.gainers.length === 0 ? (
                  <div className="text-[12px] text-[var(--v2-muted)]">No data yet.</div>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-3 shadow-[var(--v2-shadow-sm)]">
              <div className="text-[12px] font-semibold text-[var(--v2-text)]">Top losers</div>
              <div className="mt-2 grid gap-2">
                {movers.losers.map(({ m, changePct }) => {
                  const base = String(m.base_symbol).toUpperCase();
                  const quote = String(m.quote_symbol).toUpperCase();
                  const label = `${base}/${quote}`;
                  const c = changePct ?? 0;
                  const t = `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`;
                  return (
                    <Link
                      key={m.id}
                      href={`/v2/trade?base=${encodeURIComponent(base)}&quote=${encodeURIComponent(quote)}`}
                      className="flex items-center justify-between gap-2 rounded-xl bg-[var(--v2-surface-2)] px-2 py-2"
                    >
                      <div className="text-[12px] font-semibold text-[var(--v2-text)]">{label}</div>
                      <div className="text-[12px] font-semibold text-[var(--v2-down)]">{t}</div>
                    </Link>
                  );
                })}
                {movers.losers.length === 0 ? (
                  <div className="text-[12px] text-[var(--v2-muted)]">No data yet.</div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {showError ? (
        <V2Card>
          <V2CardHeader title="Markets unavailable" subtitle="Check connectivity and try again." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">{String(error)}</div>
            <div className="mt-3">
              <V2Button variant="primary" fullWidth onClick={() => void load()}>
                Retry
              </V2Button>
            </div>
          </V2CardBody>
        </V2Card>
      ) : loading ? (
        <div className="grid gap-2">
          <V2Skeleton className="h-14" />
          <V2Skeleton className="h-14" />
          <V2Skeleton className="h-14" />
          <V2Skeleton className="h-14" />
          <V2Skeleton className="h-14" />
        </div>
      ) : rows.length === 0 ? (
        <V2Card>
          <V2CardHeader title="No matches" subtitle="Try a different search." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">Nothing found for “{normalizedQuery || "—"}”.</div>
          </V2CardBody>
        </V2Card>
      ) : (
        <section className="grid gap-2">
          {rows.slice(0, 60).map((m) => {
            const base = String(m.base_symbol).toUpperCase();
            const quote = String(m.quote_symbol).toUpperCase();
            const label = `${base}/${quote}`;
            const change = m.changePct;
            const changeText = change == null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
            const changeClass = change == null ? "text-[var(--v2-muted)]" : change >= 0 ? "text-[var(--v2-up)]" : "text-[var(--v2-down)]";

            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/v2/trade?base=${encodeURIComponent(base)}&quote=${encodeURIComponent(quote)}`}
                      className="truncate text-[15px] font-semibold text-[var(--v2-text)]"
                    >
                      {label}
                    </Link>
                    {m.is_halted ? (
                      <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-warn-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-warn)]">
                        Halted
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[var(--v2-muted)]">Vol: {fmtPrice(m.stats?.quote_volume ?? null)} {quote}</div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-semibold text-[var(--v2-text)]">{fmtPrice(m.last)}</div>
                  <div className={`text-[12px] font-semibold ${changeClass}`}>{changeText}</div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFav(m.id)}
                  className={
                    "ml-1 flex h-11 w-11 items-center justify-center rounded-2xl border shadow-[var(--v2-shadow-sm)] " +
                    (m.isFav
                      ? "border-[color-mix(in_srgb,var(--v2-accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)] text-[var(--v2-accent)]"
                      : "border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-muted)] hover:bg-[var(--v2-surface-2)]")
                  }
                  aria-label={m.isFav ? "Remove favorite" : "Add favorite"}
                  title={m.isFav ? "Unfavorite" : "Favorite"}
                >
                  <span aria-hidden>{m.isFav ? "★" : "☆"}</span>
                </button>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
