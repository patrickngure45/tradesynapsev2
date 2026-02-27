"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Skeleton } from "@/components/v2/Skeleton";

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
      <V2Skeleton className="h-40" />
    );
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-warn-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--v2-text)]">
          Error: <span className="font-extrabold">{error}</span>
        </div>
      ) : null}

      <V2Card>
        <V2CardHeader
          title="Summary"
          subtitle={`Enabled ${enabledCount} · Disabled ${disabledCount}`}
          right={
            <V2Button size="sm" variant="ghost" onClick={() => void refresh()}>
              Refresh
            </V2Button>
          }
        />
        <V2CardBody>
          <div className="grid gap-2 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[var(--v2-muted)]">Total markets</div>
              <div className="font-semibold text-[var(--v2-text)]">{markets.length}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[var(--v2-muted)]">Enabled</div>
              <div className="font-semibold text-[var(--v2-text)]">{enabledCount}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[var(--v2-muted)]">Disabled</div>
              <div className="font-semibold text-[var(--v2-text)]">{disabledCount}</div>
            </div>
          </div>
        </V2CardBody>
      </V2Card>

      {markets.length === 0 ? (
        <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-6 py-10 text-center text-[13px] text-[var(--v2-muted)] shadow-[var(--v2-shadow-sm)]">
          No markets.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] shadow-[var(--v2-shadow-md)]">
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--v2-surface-2)]">
              <tr className="text-left text-[11px] font-extrabold uppercase tracking-widest text-[var(--v2-muted)]">
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
                  <tr key={m.id} className="border-t border-[var(--v2-border)]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--v2-text)]">{m.symbol}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--v2-muted)]">{m.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                          (isEnabled
                            ? "border-[color-mix(in_srgb,var(--v2-up)_40%,var(--v2-border))] text-[var(--v2-up)]"
                            : "border-[color-mix(in_srgb,var(--v2-warn)_40%,var(--v2-border))] text-[var(--v2-warn)]")
                        }
                      >
                        {isEnabled ? "enabled" : "disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[var(--v2-muted)]">
                      maker {m.maker_fee_bps}bps · taker {m.taker_fee_bps}bps
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEnabled ? (
                        <V2Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void setStatus(m.id, "disabled")}
                        >
                          {busy ? "…" : "Disable"}
                        </V2Button>
                      ) : (
                        <V2Button
                          size="sm"
                          variant="primary"
                          disabled={busy}
                          onClick={() => void setStatus(m.id, "enabled")}
                        >
                          {busy ? "…" : "Enable"}
                        </V2Button>
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
