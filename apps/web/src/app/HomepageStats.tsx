"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

type Market = { id: string; symbol: string };
type Stats = {
  last: string | null;
  open: string | null;
  volume: string | null;
  quote_volume: string | null;
  trade_count: number;
};

type Health = {
  status?: "ok" | "degraded";
  uptime_s?: number;
  db?: string;
  latency_ms?: number;
};

type HealthDb = {
  migrations?: { pending?: string[]; ok?: boolean };
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
  const [health, setHealth] = useState<Health | null>(null);
  const [healthDb, setHealthDb] = useState<HealthDb | null>(null);

  const load = useCallback(async () => {
    try {
      const [healthRes, healthDbRes, mktsRes] = await Promise.allSettled([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/health/db", { cache: "no-store" }),
        fetch("/api/exchange/markets", fetchOpts),
      ]);

      if (healthRes.status === "fulfilled") {
        const hj = await healthRes.value.json().catch(() => null);
        if (hj && typeof hj === "object") setHealth(hj as Health);
      }
      if (healthDbRes.status === "fulfilled") {
        const dj = await healthDbRes.value.json().catch(() => null);
        if (dj && typeof dj === "object") setHealthDb(dj as HealthDb);
      }

      const mktsJson = mktsRes.status === "fulfilled" ? await mktsRes.value.json().catch(() => null) : null;
      const markets: Market[] = mktsJson?.markets ?? [];
      setTotalMarkets(markets.length);

      if (markets.length === 0) {
        setStats(null);
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
        volume: s?.quote_volume ?? "0",
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
      <div
        className="relative w-full rounded-3xl p-[1px] shadow-[var(--shadow)]"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--up) 18%, transparent), color-mix(in srgb, var(--accent-2) 14%, transparent))",
        }}
      >
        <div className="relative overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--card)] px-5 py-5">
          <div
            className="pointer-events-none absolute inset-x-0 -top-10 h-24 opacity-60"
            aria-hidden
            style={{
              background:
                "radial-gradient(900px 240px at 10% 0%, color-mix(in oklab, var(--up) 10%, transparent) 0%, transparent 60%), radial-gradient(640px 220px at 92% 10%, color-mix(in oklab, var(--accent-2) 9%, transparent) 0%, transparent 55%)",
            }}
          />

          <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                <div className="h-3 w-20 animate-pulse rounded bg-[var(--border)]" />
                <div className="mt-2 h-4 w-28 animate-pulse rounded bg-[var(--border)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null; // no markets yet

  const baseShell = (
    tiles: {
      label: string;
      value: string;
      valueClassName?: string;
      dotTone?: "muted" | "accent" | "accent2" | "up" | "down";
      adornment?: ReactNode;
    }[],
  ) => (
    <div
      className="fade-in-up relative w-full rounded-3xl p-[1px] shadow-[var(--shadow)]"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--up) 18%, transparent), color-mix(in srgb, var(--accent-2) 14%, transparent))",
      }}
    >
      <div className="relative overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--card)] px-5 py-5">
        <div
          className="pointer-events-none absolute inset-x-0 -top-10 h-24 opacity-60"
          aria-hidden
          style={{
            background:
              "radial-gradient(900px 240px at 10% 0%, color-mix(in oklab, var(--up) 10%, transparent) 0%, transparent 60%), radial-gradient(640px 220px at 92% 10%, color-mix(in oklab, var(--accent-2) 9%, transparent) 0%, transparent 55%)",
          }}
        />

        <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {tiles.map((t) => (
            <StatTile
              key={t.label}
              label={t.label}
              value={t.value}
              valueClassName={t.valueClassName}
              dotTone={t.dotTone}
              adornment={t.adornment}
            />
          ))}
        </div>
      </div>
    </div>
  );

  if (!stats) {
    const status = health?.status ?? "degraded";
    const ok = status === "ok";
    const latency = typeof health?.latency_ms === "number" ? `${health!.latency_ms} ms` : "—";
    const uptime = typeof health?.uptime_s === "number" ? fmtUptime(health!.uptime_s) : "—";
    const pending = healthDb?.migrations?.pending?.length;
    const mig = typeof pending === "number" ? (pending === 0 ? "OK" : `${pending} pending`) : "—";

    return baseShell([
      {
        label: "DB",
        value: ok ? "Online" : "Degraded",
        valueClassName: ok ? "text-[var(--up)]" : "text-[var(--down)]",
        dotTone: ok ? "up" : "down",
      },
      { label: "Latency", value: latency, dotTone: "accent2" },
      { label: "Uptime", value: uptime, dotTone: "accent" },
      {
        label: "Migrations",
        value: mig,
        valueClassName: mig.includes("pending") ? "text-[var(--warn)]" : undefined,
        dotTone: mig.includes("pending") ? "down" : "muted",
      },
      { label: "Markets", value: String(totalMarkets), dotTone: "muted" },
    ]);
  }

  const change = pctChange(stats.open, stats.last);
  const quoteSymbol = stats.symbol.split("/")[1]?.trim() || "";
  const volumeLabel = quoteSymbol ? `24h Volume (${quoteSymbol})` : "24h Volume";
  const baseSymbol = stats.symbol.split("/")[0]?.trim() || "";

  return baseShell([
    {
      label: stats.symbol,
      value: fmt(stats.last, 4),
      dotTone: "accent",
      adornment: baseSymbol ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/assets/icon?symbol=${encodeURIComponent(baseSymbol)}`}
          alt={baseSymbol}
          width={18}
          height={18}
          className="h-4.5 w-4.5 rounded-full border border-[var(--border)] bg-[var(--card)] object-contain"
          loading="lazy"
        />
      ) : null,
    },
    {
      label: "24h Change",
      value: change.text,
      valueClassName: change.up ? "text-[var(--up)]" : "text-[var(--down)]",
      dotTone: change.up ? "up" : "down",
    },
    { label: volumeLabel, value: fmt(stats.volume), dotTone: "accent2" },
    { label: "Trades", value: stats.trade_count.toLocaleString(), dotTone: "muted" },
    { label: "Markets", value: String(totalMarkets), dotTone: "muted" },
  ]);
}

function fmtUptime(uptimeS: number): string {
  const s = Math.max(0, Math.floor(uptimeS));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${mm}m`;
}

function StatTile({
  label,
  value,
  valueClassName,
  dotTone = "muted",
  adornment,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  dotTone?: "muted" | "accent" | "accent2" | "up" | "down";
  adornment?: ReactNode;
}) {
  const dot =
    dotTone === "up"
      ? "bg-[var(--up)]"
      : dotTone === "down"
        ? "bg-[var(--down)]"
        : dotTone === "accent2"
          ? "bg-[var(--accent-2)]"
          : dotTone === "accent"
            ? "bg-[var(--accent)]"
            : "bg-[var(--border)]";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className={"absolute inline-flex h-2.5 w-2.5 rounded-full " + dot} />
            <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
          </span>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">{label}</span>
        </div>
        {adornment ? <span className="shrink-0">{adornment}</span> : null}
      </div>

      <div className={"mt-2 text-sm font-semibold tabular-nums text-[var(--foreground)] " + (valueClassName ?? "")}>{value}</div>
    </div>
  );
}
