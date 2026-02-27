"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { V2Tabs } from "@/components/v2/Tabs";

type MarketOverviewRow = {
  id: string;
  symbol: string;
  is_halted: boolean;
  base_symbol: string;
  quote_symbol: string;
  stats: null | {
    open: string;
    last: string;
    high?: string | null;
    low?: string | null;
    volume?: string | null;
    quote_volume: string;
    trade_count?: number;
  };
};

type MarketsOverviewResponse = { markets: MarketOverviewRow[] };

type ConditionalOrderRow = {
  id: string;
  kind: "stop_limit" | "oco" | "trailing_stop";
  side: "buy" | "sell";
  market_id: string;
  market_symbol: string;
  trigger_price: string;
  limit_price: string;
  take_profit_price: string | null;
  triggered_leg: string | null;
  trail_bps: number | null;
  trailing_ref_price: string | null;
  trailing_stop_price: string | null;
  activated_at: string | null;
  quantity: string;
  status: string;
  attempt_count: number;
  last_attempt_at: string | null;
  triggered_at: string | null;
  placed_order_id: string | null;
  failure_reason: string | null;
  created_at: string;
};

type ListResp = { conditional_orders: ConditionalOrderRow[] } | { error: string; details?: any };

type CreateResp = { ok: true; id: string | null } | { error: string; details?: any };

type CancelResp = { ok: true; canceled: number } | { error: string; details?: any };

function upper(v: string): string {
  return String(v ?? "").trim().toUpperCase();
}

function fmtTs(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : s;
}

export function ConditionalClient() {
  const sp = useSearchParams();
  const initialBase = upper(String(sp?.get("base") ?? "BTC"));
  const initialQuote = upper(String(sp?.get("quote") ?? "USDT"));

  const [pair, setPair] = useState<{ base: string; quote: string }>({ base: initialBase, quote: initialQuote });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [pairSearch, setPairSearch] = useState("");

  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketOverviewRow[]>([]);

  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ConditionalOrderRow[]>([]);

  const [kind, setKind] = useState<"stop_limit" | "oco" | "trailing_stop">("stop_limit");
  const [side, setSide] = useState<"buy" | "sell">("buy");

  const [triggerPrice, setTriggerPrice] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [qty, setQty] = useState("");

  const [tpPrice, setTpPrice] = useState("");
  const [stopTrigger, setStopTrigger] = useState("");
  const [stopLimit, setStopLimit] = useState("");

  const [activationPrice, setActivationPrice] = useState("");
  const [trailBps, setTrailBps] = useState("50");

  const [action, setAction] = useState<{ kind: "idle" | "working" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const tabs = useMemo(
    () => [
      { id: "stop_limit", label: "Stop‑Limit" },
      { id: "oco", label: "OCO" },
      { id: "trailing_stop", label: "Trailing" },
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const loadMarkets = async () => {
      setMarketError(null);
      try {
        const res = await fetch("/api/exchange/markets/overview?fiat=USD", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as MarketsOverviewResponse | null;
        if (!res.ok) throw new Error("markets_unavailable");
        const rows = Array.isArray(json?.markets) ? json!.markets : [];
        const usdt = rows.filter((m) => upper(m.quote_symbol) === "USDT");
        if (!cancelled) setMarkets(usdt);
      } catch (e) {
        if (!cancelled) setMarketError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setMarketLoading(false);
      }
    };

    void loadMarkets();
    const id = window.setInterval(() => void loadMarkets(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const market = useMemo(() => {
    const base = upper(pair.base);
    const quote = upper(pair.quote);
    return markets.find((m) => upper(m.base_symbol) === base && upper(m.quote_symbol) === quote) ?? null;
  }, [markets, pair.base, pair.quote]);

  const marketId = market?.id ?? null;

  const filteredMarkets = useMemo(() => {
    const q = pairSearch.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((m) => String(m.symbol ?? "").toLowerCase().includes(q));
  }, [markets, pairSearch]);

  const loadOrders = async (id: string) => {
    setOrdersError(null);
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/exchange/conditional-orders?market_id=${encodeURIComponent(id)}&status=all&limit=100`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as ListResp | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setOrders([]);
        setOrdersError(typeof msg === "string" && msg.length ? msg : `Orders unavailable (HTTP ${res.status}).`);
        return;
      }
      setOrders(Array.isArray((json as any)?.conditional_orders) ? ((json as any).conditional_orders as ConditionalOrderRow[]) : []);
    } catch (e) {
      setOrders([]);
      setOrdersError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (!marketId) return;
    void loadOrders(marketId);
    const id = window.setInterval(() => void loadOrders(marketId), 10_000);
    return () => window.clearInterval(id);
  }, [marketId]);

  const create = async () => {
    if (!marketId) return;

    setAction({ kind: "working" });
    try {
      const body: any = { kind, market_id: marketId, side, quantity: qty.trim() };

      if (kind === "stop_limit") {
        body.trigger_price = triggerPrice.trim();
        body.limit_price = limitPrice.trim();
      } else if (kind === "oco") {
        body.take_profit_price = tpPrice.trim();
        body.stop_trigger_price = stopTrigger.trim();
        body.stop_limit_price = stopLimit.trim();
      } else {
        body.activation_price = activationPrice.trim();
        body.trail_bps = Number(trailBps);
        body.limit_price = limitPrice.trim();
      }

      const res = await fetch("/api/exchange/conditional-orders", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as CreateResp | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setAction({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Create failed (HTTP ${res.status}).` });
        return;
      }

      setAction({ kind: "ok", message: "Conditional order created" });
      setTriggerPrice("");
      setLimitPrice("");
      setQty("");
      setTpPrice("");
      setStopTrigger("");
      setStopLimit("");
      setActivationPrice("");
      await loadOrders(marketId);
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const cancel = async (id: string) => {
    setAction({ kind: "working" });
    try {
      const res = await fetch(`/api/exchange/conditional-orders?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
      const json = (await res.json().catch(() => null)) as CancelResp | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setAction({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Cancel failed (HTTP ${res.status}).` });
        return;
      }
      setAction({ kind: "ok", message: "Canceled" });
      if (marketId) await loadOrders(marketId);
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Conditional</div>
            <div className="mt-0.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="truncate rounded-xl bg-[var(--v2-surface)] px-2 py-1 text-xl font-extrabold tracking-tight shadow-[var(--v2-shadow-sm)] hover:bg-[var(--v2-surface-2)]"
                title="Change pair"
              >
                {upper(pair.base)}/{upper(pair.quote)}
              </button>
              <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2 py-1 text-[12px] font-semibold text-[var(--v2-muted)]">Spot</span>
              {market?.is_halted ? (
                <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-warn-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-warn)]">Halted</span>
              ) : null}
            </div>
            {marketError ? <div className="mt-1 text-[12px] text-[var(--v2-down)]">Markets unavailable</div> : null}
          </div>
          <V2Button variant="primary" size="sm" onClick={() => setSheetOpen(true)}>
            Pairs
          </V2Button>
        </div>
      </header>

      <V2Tabs tabs={tabs} activeId={kind} onChange={(id) => { setKind(id as any); setAction({ kind: "idle" }); }} />

      {action.kind === "error" ? <div className="text-sm text-[var(--v2-down)]">{action.message ?? "Action failed."}</div> : null}
      {action.kind === "ok" ? <div className="text-sm text-[var(--v2-up)]">{action.message ?? "OK"}</div> : null}

      <V2Card>
        <V2CardHeader title="Create" subtitle="Stop-limit, OCO, trailing" />
        <V2CardBody>
          {!marketId ? (
            marketLoading ? <V2Skeleton className="h-40 w-full" /> : <div className="text-sm text-[var(--v2-muted)]">Select a pair.</div>
          ) : (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <V2Button variant={side === "buy" ? "primary" : "secondary"} fullWidth onClick={() => setSide("buy")}>Buy</V2Button>
                <V2Button variant={side === "sell" ? "danger" : "secondary"} fullWidth onClick={() => setSide("sell")}>Sell</V2Button>
              </div>

              {kind === "stop_limit" ? (
                <>
                  <V2Input inputMode="decimal" placeholder="Trigger price" value={triggerPrice} onChange={(e) => setTriggerPrice(e.target.value)} />
                  <V2Input inputMode="decimal" placeholder="Limit price" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
                </>
              ) : kind === "oco" ? (
                <>
                  <V2Input inputMode="decimal" placeholder="Take profit price" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} />
                  <V2Input inputMode="decimal" placeholder="Stop trigger price" value={stopTrigger} onChange={(e) => setStopTrigger(e.target.value)} />
                  <V2Input inputMode="decimal" placeholder="Stop limit price" value={stopLimit} onChange={(e) => setStopLimit(e.target.value)} />
                </>
              ) : (
                <>
                  <V2Input inputMode="decimal" placeholder="Activation price" value={activationPrice} onChange={(e) => setActivationPrice(e.target.value)} />
                  <V2Input inputMode="numeric" placeholder="Trail (bps)" value={trailBps} onChange={(e) => setTrailBps(e.target.value)} />
                  <V2Input inputMode="decimal" placeholder="Limit price" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
                </>
              )}

              <V2Input inputMode="decimal" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />

              <V2Button variant="primary" fullWidth disabled={action.kind === "working"} onClick={() => void create()}>
                {action.kind === "working" ? "Creating…" : "Create conditional order"}
              </V2Button>

              <div className="text-[12px] text-[var(--v2-muted)]">Needs the conditional orders cron/worker to be running.</div>
            </div>
          )}
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="My conditional orders" subtitle="Active and history" />
        <V2CardBody>
          {ordersError ? <div className="text-sm text-[var(--v2-down)]">{ordersError}</div> : null}
          {ordersLoading ? (
            <div className="grid gap-2">
              <V2Skeleton className="h-16 w-full" />
              <V2Skeleton className="h-16 w-full" />
            </div>
          ) : orders.length ? (
            <div className="grid gap-2">
              {orders.map((o) => {
                const statusChip =
                  o.status === "active"
                    ? "bg-[var(--v2-up)] text-white"
                    : o.status === "triggered"
                      ? "bg-[var(--v2-surface)] text-[var(--v2-muted)] border border-[var(--v2-border)]"
                      : o.status === "failed"
                        ? "bg-[var(--v2-down)] text-white"
                        : "bg-[var(--v2-warn)] text-white";

                return (
                  <div key={o.id} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-[var(--v2-text)]">{o.kind} · {o.side.toUpperCase()} · qty {o.quantity}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                          <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + statusChip}>{o.status}</span>
                          <span className="text-[var(--v2-muted)]">Created {fmtTs(o.created_at)}</span>
                        </div>
                        {o.kind === "oco" ? (
                          <div className="mt-1 text-[12px] text-[var(--v2-muted)]">TP {o.take_profit_price} · Stop {o.trigger_price} / {o.limit_price}</div>
                        ) : o.kind === "trailing_stop" ? (
                          <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Act {o.trigger_price} · Trail {o.trail_bps}bps · Limit {o.limit_price}</div>
                        ) : (
                          <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Trig {o.trigger_price} · Limit {o.limit_price}</div>
                        )}
                        {o.failure_reason ? <div className="mt-1 text-[12px] text-[var(--v2-down)]">{o.failure_reason}</div> : null}
                      </div>

                      <div className="shrink-0">
                        {o.status === "active" || o.status === "triggering" ? (
                          <V2Button variant="secondary" size="xs" onClick={() => void cancel(o.id)} disabled={action.kind === "working"}>
                            Cancel
                          </V2Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[12px] text-[var(--v2-muted)]">No conditional orders yet.</div>
          )}
        </V2CardBody>
      </V2Card>

      <V2Sheet open={sheetOpen} title="Select pair" onClose={() => setSheetOpen(false)}>
        <div className="grid gap-2">
          <V2Input placeholder="Search" value={pairSearch} onChange={(e) => setPairSearch(e.target.value)} />
          <div className="grid gap-1">
            {filteredMarkets.map((m) => {
              const active = marketId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setPair({ base: upper(m.base_symbol), quote: upper(m.quote_symbol) }); setSheetOpen(false); }}
                  className={
                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left shadow-[var(--v2-shadow-sm)] " +
                    (active
                      ? "border-[var(--v2-border)] bg-[var(--v2-surface-2)]"
                      : "border-[var(--v2-border)] bg-[var(--v2-surface)] hover:bg-[var(--v2-surface-2)]")
                  }
                >
                  <div className="text-[14px] font-semibold text-[var(--v2-text)]">{m.symbol}</div>
                  {m.is_halted ? <div className="text-[11px] font-semibold text-[var(--v2-warn)]">Halted</div> : null}
                </button>
              );
            })}
            {filteredMarkets.length === 0 ? <div className="text-sm text-[var(--v2-muted)]">No markets found.</div> : null}
          </div>
        </div>
      </V2Sheet>
    </main>
  );
}
