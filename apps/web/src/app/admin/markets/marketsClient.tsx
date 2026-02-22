"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";

type MarketRow = {
  id: string;
  chain: string;
  symbol: string;
  status: "enabled" | "disabled" | string;
  tick_size: string;
  lot_size: string;
  maker_fee_bps: number;
  taker_fee_bps: number;
  created_at: string;
};

type ListResponse = {
  ok: true;
  markets: MarketRow[];
};

export function AdminMarketsClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetchJsonOrThrow<ListResponse>("/api/exchange/admin/markets", { cache: "no-store" });
      setMarkets(Array.isArray(res.markets) ? res.markets : []);
    } catch (e) {
      if (e instanceof ApiError) setError(e.code);
      else setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const enabledCount = useMemo(() => markets.filter((m) => m.status === "enabled").length, [markets]);
  const disabledCount = useMemo(() => markets.filter((m) => m.status === "disabled").length, [markets]);

  async function setStatus(marketId: string, nextStatus: "enabled" | "disabled") {
    setError(null);
    setSavingId(marketId);
    try {
      await fetchJsonOrThrow(`/api/exchange/admin/markets/${marketId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      await refresh();
    } catch (e) {
      if (e instanceof ApiError) setError(e.code);
      else setError("Network error");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="h-40 w-full animate-pulse rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_55%,transparent)]" />
    );
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--warn-bg)] px-5 py-4 text-sm text-[var(--foreground)]">
          Error: <span className="font-semibold">{error}</span>
        </div>
      ) : null}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Summary</div>
            <div className="mt-1 text-xs text-[var(--muted)]">Enabled {enabledCount} · Disabled {disabledCount}</div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            Refresh
          </button>
        </div>
      </section>

      {markets.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center text-sm text-[var(--muted)]">
          No markets.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--card-2)]">
              <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                <th className="px-4 py-3">Market</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Fees</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => {
                const isEnabled = m.status === "enabled";
                const busy = savingId === m.id;
                return (
                  <tr key={m.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--foreground)]">{m.symbol}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">{m.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                          (isEnabled
                            ? "border-[color-mix(in_srgb,var(--up)_40%,var(--border))] text-[var(--up)]"
                            : "border-[color-mix(in_srgb,var(--warn)_40%,var(--border))] text-[var(--warn)]")
                        }
                      >
                        {isEnabled ? "enabled" : "disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[var(--muted)]">
                      maker {m.maker_fee_bps}bps · taker {m.taker_fee_bps}bps
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEnabled ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setStatus(m.id, "disabled")}
                          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)]"
                        >
                          {busy ? "…" : "Disable"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setStatus(m.id, "enabled")}
                          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)]"
                        >
                          {busy ? "…" : "Enable"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
