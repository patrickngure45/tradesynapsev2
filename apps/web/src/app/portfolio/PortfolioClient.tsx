"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatDecimalString, isNonZeroDecimalString } from "@/lib/format/amount";
import { AssetIcon } from "@/components/AssetIcon";

type Balance = {
  assetId: string;
  symbol: string;
  posted: string;
  held: string;
  available: string;
};

type Fill = {
  executionId: string;
  market: string;
  side: string;
  role: string;
  price: string;
  quantity: string;
  quoteAmount: string;
  createdAt: string;
};

type PortfolioData = {
  balances: Balance[];
  stats: {
    totalFills: number;
    totalVolume: string;
    fills24h: number;
    openOrders: number;
  };
  pnl: {
    totalSold: string;
    totalBought: string;
    totalFees: string;
    realizedPnl: string;
  };
  recentFills: Fill[];
};

type ProfileResponse = {
  user?: {
    country: string | null;
  };
};

function fiatForCountry(country: string | null | undefined): string {
  const normalized = String(country ?? "").trim().toUpperCase();
  if (normalized === "KE" || normalized === "KENYA") return "KES";
  if (normalized === "TZ" || normalized === "TANZANIA") return "TZS";
  if (normalized === "UG" || normalized === "UGANDA") return "UGX";
  if (normalized === "RW" || normalized === "RWANDA") return "RWF";
  return "USD";
}

function fmtFiat(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
  }
}

export function PortfolioClient() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localFiat, setLocalFiat] = useState<string>("USD");

  const fetchPortfolio = useCallback(async () => {
    try {
      const userId = localStorage.getItem("ts_user_id") ?? "";
      const res = await fetch("/api/exchange/portfolio", {
        credentials: "include",
        headers: userId ? { "x-user-id": userId } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);

      try {
        const profileRes = await fetch("/api/account/profile", {
          credentials: "include",
          headers: userId ? { "x-user-id": userId } : {},
          cache: "no-store",
        });
        const profile = (await profileRes.json().catch(() => ({}))) as ProfileResponse;
        const fiat = fiatForCountry(profile.user?.country);
        setLocalFiat(fiat);
      } catch {
        setLocalFiat("USD");
      }

      setError(null);
    } catch {
      setError("Failed to load portfolio data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 15_000);
    return () => clearInterval(interval);
  }, [fetchPortfolio]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_55%,transparent)] px-6 py-10 text-center text-sm text-[var(--muted)]">
        Loading portfolio…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-[color-mix(in_srgb,var(--down)_22%,var(--border))] bg-[color-mix(in_srgb,var(--down)_10%,transparent)] px-5 py-4 text-sm text-[var(--muted)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold text-[var(--foreground)]">Portfolio unavailable</div>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchPortfolio();
            }}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-2)]"
          >
            Retry
          </button>
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">{error ?? "No data"}</div>
      </div>
    );
  }

  const pnlValue = parseFloat(data.pnl.realizedPnl);
  const pnlColor = pnlValue > 0 ? "text-[var(--up)]" : pnlValue < 0 ? "text-[var(--down)]" : "text-[var(--muted)]";

  const balancesWithActivity = data.balances.filter((b) => {
    return isNonZeroDecimalString(b.posted) || isNonZeroDecimalString(b.held);
  });

  const balancesToShow = balancesWithActivity.length > 0 ? balancesWithActivity : data.balances;

  return (
    <div className="space-y-6">
      {/* Get started banner for new users */}
      {data.stats.totalFills === 0 && data.balances.length === 0 && (
        <div
          className="relative overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--card)] px-7 py-8 text-center shadow-[var(--shadow)]"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            aria-hidden
            style={{
              background:
                "radial-gradient(900px 320px at 15% 0%, color-mix(in oklab, var(--accent) 12%, transparent) 0%, transparent 60%), radial-gradient(640px 280px at 92% 10%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 58%)",
            }}
          />

          <div className="relative mx-auto max-w-xl">
            <div className="mx-auto flex w-fit items-center gap-3">
              <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
              </span>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Start here</div>
              <div className="h-px w-16 bg-[var(--border)]" />
            </div>

            <h3 className="mt-5 text-lg font-semibold tracking-tight text-[var(--foreground)]">No activity yet</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Fund your wallet, place a trade, and this page turns into your execution ledger: PnL, volume, and recent fills.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/wallet"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-5 text-xs font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-95"
              >
                Fund wallet
              </Link>
              <Link
                href="/exchange"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] px-5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-2)]"
              >
                Open terminal
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Realized PnL"
          value={`${pnlValue >= 0 ? "+" : ""}${pnlValue.toFixed(4)}`}
          sub="Quote currency"
          className={pnlColor}
        />
        <StatCard
          label="Total Volume"
          value={parseFloat(data.stats.totalVolume).toFixed(2)}
          sub={`${data.stats.totalFills} fills total`}
        />
        <StatCard
          label="24h Activity"
          value={String(data.stats.fills24h)}
          sub="fills in last 24h"
        />
        <StatCard
          label="Open Orders"
          value={String(data.stats.openOrders)}
          sub={<Link href="/exchange" className="text-[var(--accent)] hover:underline">View on exchange</Link>}
        />
      </div>

      {/* Balances */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">Balances</h3>
          <Link href="/wallet" className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]">
            Wallet →
          </Link>
        </div>
        {balancesToShow.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No balances yet. <Link href="/wallet" className="text-[var(--accent)] hover:underline">Deposit funds</Link></p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                  <th className="pb-2">Token</th>
                  <th className="pb-2 text-right">Available</th>
                  <th className="pb-2 text-right">Held</th>
                  <th className="pb-2 text-right">Local Value</th>
                </tr>
              </thead>
              <tbody>
                {balancesToShow.map((b) => {
                  const availableText = formatDecimalString(b.available, 8);
                  const heldText = formatDecimalString(b.held, 8);
                  const localEquivalent = null;

                  return (
                    <tr key={b.assetId} className="border-b border-[var(--border)]/50">
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2 font-semibold text-[var(--foreground)]">
                          <AssetIcon symbol={b.symbol} size={18} />
                          {b.symbol.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono">{availableText}</td>
                      <td className="py-2 text-right font-mono text-[var(--muted)]">{heldText}</td>
                      <td className="py-2 text-right font-mono text-[var(--muted)]">
                        {localEquivalent == null ? `— ${localFiat}` : fmtFiat(localEquivalent, localFiat)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PnL breakdown */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">PnL Breakdown</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-[var(--muted)]">Total Bought</div>
            <div className="mt-1 font-mono text-sm">{parseFloat(data.pnl.totalBought).toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">Total Sold</div>
            <div className="mt-1 font-mono text-sm">{parseFloat(data.pnl.totalSold).toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">Total Fees</div>
            <div className="mt-1 font-mono text-sm text-[var(--warn)]">
              {parseFloat(data.pnl.totalFees).toFixed(4)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">Realized PnL</div>
            <div className={`mt-1 font-mono text-sm font-bold ${pnlColor}`}>
              {pnlValue >= 0 ? "+" : ""}{pnlValue.toFixed(4)}
            </div>
          </div>
        </div>
      </div>

      {/* Recent fills */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">Recent Fills</h3>
        {data.recentFills.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No trade history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                  <th className="pb-2">Market</th>
                  <th className="pb-2">Side</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Total</th>
                  <th className="pb-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.recentFills.map((f) => (
                  <tr key={f.executionId} className="border-b border-[var(--border)]/50">
                    <td className="py-1.5 font-medium">{f.market}</td>
                    <td className={`py-1.5 ${f.side === "buy" ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                      {f.side.toUpperCase()}
                    </td>
                    <td className="py-1.5 text-[var(--muted)]">{f.role}</td>
                    <td className="py-1.5 text-right font-mono">{parseFloat(f.price).toFixed(4)}</td>
                    <td className="py-1.5 text-right font-mono">{parseFloat(f.quantity).toFixed(4)}</td>
                    <td className="py-1.5 text-right font-mono">{parseFloat(f.quoteAmount).toFixed(4)}</td>
                    <td className="py-1.5 text-right text-xs text-[var(--muted)]">
                      {new Date(f.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, className = "" }: {
  label: string;
  value: string;
  sub: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className="relative rounded-3xl p-[1px] shadow-[var(--shadow)]"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent-2) 14%, transparent))",
      }}
    >
      <div className="relative h-full rounded-3xl border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--card)] p-5">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">{label}</div>
        <div className={"mt-2 font-mono text-2xl font-extrabold tabular-nums text-[var(--foreground)] " + className}>{value}</div>
        <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>
      </div>
    </div>
  );
}
