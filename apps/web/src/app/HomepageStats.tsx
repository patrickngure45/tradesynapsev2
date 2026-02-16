"use client";

import { useCallback, useEffect, useState } from "react";

type Market = { id: string; symbol: string };
type Stats = {
  last: string | null;
  open: string | null;
  volume: string | null;
  quote_volume: string | null;
  trade_count: number;
};

const fetchOpts: RequestInit = { credentials: "include", cache: "no-store" };

function fmt(v: string | null, decimals = 2): string {
  if (!v) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pctChange(open: string | null, last: string | null): { text: string; up: boolean } {
  if (!open || !last) return { text: "—", up: true };
  const o = Number(open);
  const l = Number(last);
  if (!o) return { text: "—", up: true };
  const pct = ((l - o) / o) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, up: pct >= 0 };
}

export function HomepageStats() {
  const [stats, setStats] = useState<{ symbol: string; last: string | null; open: string | null; volume: string | null; trade_count: number } | null>(null);
  const [totalMarkets, setTotalMarkets] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const mkts = await fetch("/api/exchange/markets", fetchOpts).then((r) => r.json());
      const markets: Market[] = mkts.markets ?? [];
      setTotalMarkets(markets.length);

      if (markets.length === 0) {
        setLoaded(true);
        return;
      }

      // Pick primary market (prefer */USDT)
      const primary = markets.find((m) => m.symbol.toUpperCase().endsWith("/USDT")) ?? markets[0];
      const sr = await fetch(
        `/api/exchange/marketdata/stats?market_id=${primary.id}&window_hours=24`,
        fetchOpts,
      ).then((r) => r.json());

      const s: Stats | null = sr.stats;
      setStats({
        symbol: primary.symbol,
        last: s?.last ?? null,
        open: s?.open ?? null,
        volume: s?.quote_volume ?? null,
        trade_count: s?.trade_count ?? 0,
      });
    } catch {
      // silent — homepage still works without stats
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loaded) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-4 shadow-[var(--shadow)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="h-3 w-14 animate-pulse rounded bg-[var(--border)]" />
            <div className="h-4 w-20 animate-pulse rounded bg-[var(--border)]" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null; // no markets yet

  const change = pctChange(stats.open, stats.last);
  const quoteSymbol = stats.symbol.split("/")[1]?.trim() || "";
  const volumeLabel = quoteSymbol ? `24h Volume (${quoteSymbol})` : "24h Volume";

  return (
    <div className="fade-in-up flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-4 shadow-[var(--shadow)]">
      <Stat label={stats.symbol} value={fmt(stats.last, 4)} />
      <Stat
        label="24h Change"
        value={change.text}
        className={change.up ? "text-[var(--up)]" : "text-[var(--down)]"}
      />
      <Stat label={volumeLabel} value={fmt(stats.volume)} />
      <Stat label="Trades" value={stats.trade_count.toLocaleString()} />
      <Stat label="Markets" value={String(totalMarkets)} />
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${className ?? ""}`}>{value}</span>
    </div>
  );
}
