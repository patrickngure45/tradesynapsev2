"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { V2Tabs } from "@/components/v2/Tabs";

type OrderRow = {
  id: string;
  market_id: string;
  market_symbol?: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: string;
  quantity: string;
  remaining_quantity: string;
  status: string;
  created_at: string;
  updated_at: string;
  fills?: Array<{ id: string; price: string; quantity: string; created_at: string }>;
};

type OpenOrdersResponse = { orders: OrderRow[] };

type HistoryResponse = { orders: OrderRow[] };

function fmtNum(v: string | null | undefined): string {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function OrdersClient() {
  const [tab, setTab] = useState<"open" | "history" | "fills">("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openOrders, setOpenOrders] = useState<OrderRow[]>([]);
  const [history, setHistory] = useState<OrderRow[]>([]);

  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const lastRefreshAtRef = useRef<number>(0);
  const hasLoadedRef = useRef(false);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const tabs = useMemo(
    () => [
      { id: "open", label: "Open" },
      { id: "history", label: "History" },
      { id: "fills", label: "Fills" },
    ],
    [],
  );

  const load = async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Only show skeletons for the very first load.
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const [openRes, histRes] = await Promise.all([
        fetch("/api/exchange/orders", { cache: "no-store", credentials: "include", signal: controller.signal }),
        fetch("/api/exchange/orders/history?status=all&limit=200", { cache: "no-store", credentials: "include", signal: controller.signal }),
      ]);

      const openJson = (await openRes.json().catch(() => null)) as OpenOrdersResponse | null;
      const histJson = (await histRes.json().catch(() => null)) as HistoryResponse | null;

      if (!openRes.ok) throw new Error(typeof (openJson as any)?.error === "string" ? (openJson as any).error : `http_${openRes.status}`);
      if (!histRes.ok) throw new Error(typeof (histJson as any)?.error === "string" ? (histJson as any).error : `http_${histRes.status}`);

      if (seq !== loadSeqRef.current) return;
      setOpenOrders(Array.isArray(openJson?.orders) ? openJson!.orders : []);
      setHistory(Array.isArray(histJson?.orders) ? histJson!.orders : []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (seq !== loadSeqRef.current) return;
      // If we already have content, keep it visible and ignore transient refresh errors.
      if (!hasLoadedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        hasLoadedRef.current = true;
      }
    }
  };

  useEffect(() => {
    void load();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void load();
    };
    const id = window.setInterval(tick, 12_000);
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

  // Realtime: listen for notification events and refresh Orders immediately.
  useEffect(() => {
    const stop = () => {
      try {
        esRef.current?.close();
      } catch {
        // ignore
      }
      esRef.current = null;
    };

    const shouldRefreshForType = (t: string) => {
      const type = String(t || "");
      return type === "order_placed"
        || type === "order_filled"
        || type === "order_partially_filled"
        || type === "order_canceled"
        || type === "order_rejected";
    };

    const refreshSoon = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 800) return;
      lastRefreshAtRef.current = now;
      if (document.visibilityState !== "visible") return;
      void load();
    };

    const start = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof EventSource === "undefined") return;
      if (esRef.current) return;
      try {
        const es = new EventSource("/api/notifications/stream", { withCredentials: true } as any);
        es.addEventListener("notification", (evt) => {
          try {
            const data = JSON.parse(String((evt as MessageEvent).data ?? "{}"));
            if (shouldRefreshForType(String(data?.type ?? ""))) refreshSoon();
          } catch {
            // ignore
          }
        });
        es.addEventListener("ready", () => refreshSoon());
        es.onerror = () => {
          // allow browser to retry automatically
        };
        esRef.current = es;
      } catch {
        stop();
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fills = useMemo(() => {
    const out: Array<{ order: OrderRow; fill: any }> = [];
    for (const o of history) {
      const fs = Array.isArray(o.fills) ? o.fills : [];
      for (const f of fs) out.push({ order: o, fill: f });
    }
    out.sort((a, b) => {
      const at = a.fill?.created_at ? Date.parse(String(a.fill.created_at)) : 0;
      const bt = b.fill?.created_at ? Date.parse(String(b.fill.created_at)) : 0;
      return bt - at;
    });
    return out.slice(0, 200);
  }, [history]);

  const cancelOrder = async (id: string) => {
    if (!id || cancelingId) return;
    setCancelingId(id);
    setError(null);

    // Optimistic: hide the canceled order immediately.
    const prev = openOrders;
    setOpenOrders((rows) => rows.filter((o) => o.id !== id));

    try {
      const res = await fetch(`/api/exchange/orders/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => null) as any;
      if (!res.ok) {
        // rollback
        setOpenOrders(prev);
        throw new Error(typeof json?.error === "string" ? json.error : `http_${res.status}`);
      }

      // Refresh history so status updates appear.
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelingId(null);
    }
  };

  const renderOrderRow = (o: OrderRow, showCancel: boolean) => {
    const sideColor = o.side === "buy" ? "text-[var(--v2-up)]" : "text-[var(--v2-down)]";
    const status = String(o.status ?? "").toLowerCase();

    return (
      <div key={o.id} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[15px] font-semibold text-[var(--v2-text)]">{String(o.market_symbol ?? "—")}</div>
              <span className={`text-[12px] font-semibold ${sideColor}`}>{o.side.toUpperCase()}</span>
              <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]">
                {o.type.toUpperCase()}
              </span>
              <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]">
                {status.replaceAll("_", " ")}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-[var(--v2-muted)]">{fmtTime(o.created_at)}</div>
          </div>

          {showCancel ? (
            <V2Button
              variant="ghost"
              size="sm"
              disabled={cancelingId === o.id}
              onClick={() => void cancelOrder(o.id)}
              className="border border-[var(--v2-border)]"
            >
              {cancelingId === o.id ? "Canceling…" : "Cancel"}
            </V2Button>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-xl bg-[var(--v2-surface-2)] px-2 py-2">
            <div className="text-[11px] font-semibold text-[var(--v2-muted)]">Price</div>
            <div className="mt-0.5 font-mono text-[12px] text-[var(--v2-text)]">{o.type === "market" ? "MKT" : fmtNum(o.price)}</div>
          </div>
          <div className="rounded-xl bg-[var(--v2-surface-2)] px-2 py-2">
            <div className="text-[11px] font-semibold text-[var(--v2-muted)]">Qty</div>
            <div className="mt-0.5 font-mono text-[12px] text-[var(--v2-text)]">{fmtNum(o.quantity)}</div>
          </div>
          <div className="rounded-xl bg-[var(--v2-surface-2)] px-2 py-2">
            <div className="text-[11px] font-semibold text-[var(--v2-muted)]">Remaining</div>
            <div className="mt-0.5 font-mono text-[12px] text-[var(--v2-text)]">{fmtNum(o.remaining_quantity)}</div>
          </div>
        </div>
      </div>
    );
  };

  const content = () => {
    if (error) {
      return (
        <V2Card>
          <V2CardHeader title="Orders unavailable" subtitle="Sign in and try again." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">{String(error)}</div>
            <div className="mt-3">
              <V2Button variant="primary" fullWidth onClick={() => void load()}>
                Retry
              </V2Button>
            </div>
          </V2CardBody>
        </V2Card>
      );
    }

    if (loading) {
      return (
        <div className="grid gap-2">
          <V2Skeleton className="h-20" />
          <V2Skeleton className="h-20" />
          <V2Skeleton className="h-20" />
        </div>
      );
    }

    if (tab === "open") {
      return openOrders.length === 0 ? (
        <V2Card>
          <V2CardHeader title="No open orders" subtitle="Your active orders will appear here." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">Place an order from Trade to get started.</div>
          </V2CardBody>
        </V2Card>
      ) : (
        <div className="grid gap-2">{openOrders.map((o) => renderOrderRow(o, true))}</div>
      );
    }

    if (tab === "history") {
      return history.length === 0 ? (
        <V2Card>
          <V2CardHeader title="No history" subtitle="Your completed orders will show here." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">Once you trade, you’ll see filled/canceled orders.</div>
          </V2CardBody>
        </V2Card>
      ) : (
        <div className="grid gap-2">{history.slice(0, 80).map((o) => renderOrderRow(o, false))}</div>
      );
    }

    // fills
    return fills.length === 0 ? (
      <V2Card>
        <V2CardHeader title="No fills" subtitle="Trades (fills) will show here." />
        <V2CardBody>
          <div className="text-sm text-[var(--v2-muted)]">When an order matches, fills appear with price/qty.</div>
        </V2CardBody>
      </V2Card>
    ) : (
      <div className="grid gap-2">
        {fills.slice(0, 120).map(({ order, fill }) => {
          const sideColor = order.side === "buy" ? "text-[var(--v2-up)]" : "text-[var(--v2-down)]";
          return (
            <div key={String(fill.id)} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold text-[var(--v2-text)]">{String(order.market_symbol ?? "—")}</div>
                  <div className={`mt-0.5 text-[12px] font-semibold ${sideColor}`}>{order.side.toUpperCase()}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[13px] font-semibold text-[var(--v2-text)]">{fmtNum(fill.price)}</div>
                  <div className="font-mono text-[12px] text-[var(--v2-muted)]">{fmtNum(fill.quantity)}</div>
                </div>
              </div>
              <div className="mt-2 text-[12px] text-[var(--v2-muted)]">{fmtTime(fill.created_at)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Orders</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Your activity</h1>
        <p className="text-sm text-[var(--v2-muted)]">Open orders, history, and fills — built for mobile.</p>
      </header>

      <V2Tabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as any)} />

      {content()}
    </main>
  );
}
