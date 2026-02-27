"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { describeClientError } from "@/lib/api/errorMessages";

type OrderSummary = {
  id: string;
  status: string;
  amount_fiat: string;
  fiat_currency: string;
  amount_asset: string;
  asset_symbol: string;
  price: string;
  created_at: string;
  my_side: "BUY" | "SELL";
  payment_details_ready?: boolean;
};

type OrdersResponse = { orders?: OrderSummary[] };

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function fmtNum(v: string | null | undefined): string {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export function P2POrdersClient() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);
  const lastRefreshAtRef = useRef<number>(0);
  const hasActiveRef = useRef(false);

  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    if (!hasLoadedRef.current) setLoading(true);

    try {
      const res = await fetch("/api/p2p/orders", { cache: "no-store", credentials: "include", signal: controller.signal });
      const json = (await res.json().catch(() => null)) as OrdersResponse | null;
      if (!res.ok) {
        const code = typeof (json as any)?.error === "string" ? (json as any).error : `http_${res.status}`;
        throw new Error(code);
      }
      if (seq !== loadSeqRef.current) return;
      setOrders(Array.isArray(json?.orders) ? json!.orders : []);
      hasLoadedRef.current = true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (seq !== loadSeqRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    hasActiveRef.current = orders.some((o) => {
      const s = String(o.status || "").toLowerCase();
      return s === "created" || s === "paid_confirmed" || s === "disputed";
    });
  }, [orders]);

  useEffect(() => {
    void load();
    let timeoutId: number | null = null;

    const stopTimer = () => {
      if (!timeoutId) return;
      window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    const schedule = () => {
      stopTimer();
      const delayMs = esRef.current
        ? (hasActiveRef.current ? 25_000 : 45_000)
        : 15_000;
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        if (document.visibilityState === "visible") void load();
        schedule();
      }, delayMs);
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void load();
        schedule();
      } else {
        stopTimer();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    schedule();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stopTimer();
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: refresh P2P orders list on any p2p_* notification.
  useEffect(() => {
    const stop = () => {
      try {
        esRef.current?.close();
      } catch {
        // ignore
      }
      esRef.current = null;
    };

    const refreshSoon = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 900) return;
      lastRefreshAtRef.current = now;
      if (document.visibilityState !== "visible") return;
      void load();
    };

    const shouldRefreshForType = (t: string) => {
      const type = String(t || "");
      return type.startsWith("p2p_");
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

  const { active, history, missingDetailsCount } = useMemo(() => {
    const active = orders.filter((o) => ["created", "paid_confirmed", "disputed"].includes(String(o.status)));
    const history = orders.filter((o) => !["created", "paid_confirmed", "disputed"].includes(String(o.status)));
    const missingDetailsCount = active.filter((o) => o.payment_details_ready === false).length;
    return { active, history, missingDetailsCount };
  }, [orders]);

  const errorInfo = useMemo(() => {
    if (!error) return null;
    return describeClientError(error);
  }, [error]);

  const statusChip = (status: string) => {
    const s = String(status || "").toLowerCase();
    const tone =
      s === "created" ? "text-[var(--v2-accent)]" :
      s === "paid_confirmed" ? "text-[var(--v2-warn)]" :
      s === "completed" ? "text-[var(--v2-up)]" :
      s === "disputed" ? "text-[var(--v2-down)]" :
      "text-[var(--v2-muted)]";
    return (
      <span className={`rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
        {s.replaceAll("_", " ") || "—"}
      </span>
    );
  };

  const list = (rows: OrderSummary[]) => (
    <div className="grid gap-2">
      {rows.map((o) => {
        const sideTone = o.my_side === "BUY" ? "text-[var(--v2-up)]" : "text-[var(--v2-down)]";
        return (
          <Link
            key={o.id}
            href={`/v2/p2p/orders/${encodeURIComponent(o.id)}`}
            className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className={`text-[12px] font-bold ${sideTone}`}>{o.my_side}</div>
                  <div className="text-[15px] font-semibold text-[var(--v2-text)]">{fmtNum(o.amount_asset)} {String(o.asset_symbol || "—")}</div>
                  {statusChip(o.status)}
                </div>
                <div className="mt-1 text-[12px] text-[var(--v2-muted)]">≈ {fmtNum(o.amount_fiat)} {String(o.fiat_currency || "")}</div>
                <div className="mt-1 text-[12px] text-[var(--v2-muted)]">{fmtTime(o.created_at)}</div>
              </div>

              {o.payment_details_ready === false ? (
                <span className="shrink-0 rounded-full border border-[var(--v2-border)] bg-[color-mix(in_srgb,var(--v2-warn)_10%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-warn)]">
                  Payment details missing
                </span>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">P2P</div>
            <h1 className="text-2xl font-extrabold tracking-tight">My orders</h1>
          </div>
          <Link
            href="/v2/p2p"
            className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
          >
            Marketplace
          </Link>
        </div>
        <p className="text-sm text-[var(--v2-muted)]">Active orders first, then history.</p>
      </header>

      {missingDetailsCount > 0 ? (
        <div className="rounded-2xl border border-[var(--v2-border)] bg-[color-mix(in_srgb,var(--v2-warn)_10%,transparent)] px-3 py-3 text-[12px] text-[var(--v2-text)]">
          <span className="font-semibold">Action needed:</span> {missingDetailsCount} active {missingDetailsCount === 1 ? "order is" : "orders are"} missing seller payment details.
        </div>
      ) : null}

      {errorInfo && orders.length === 0 ? (
        <V2Card>
          <V2CardHeader title={errorInfo.title} subtitle={errorInfo.message} />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">Error code: {errorInfo.code}</div>
            <div className="mt-3">
              <V2Button variant="primary" fullWidth onClick={() => void load()}>
                Retry
              </V2Button>
            </div>
          </V2CardBody>
        </V2Card>
      ) : loading && orders.length === 0 ? (
        <div className="grid gap-2">
          <V2Skeleton className="h-20" />
          <V2Skeleton className="h-20" />
          <V2Skeleton className="h-20" />
        </div>
      ) : orders.length === 0 ? (
        <V2Card>
          <V2CardHeader title="No P2P orders" subtitle="Your P2P activity will appear here." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">Start from the marketplace to create an order.</div>
          </V2CardBody>
        </V2Card>
      ) : (
        <div className="space-y-4">
          {errorInfo ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[color-mix(in_srgb,var(--v2-down)_10%,transparent)] px-3 py-3 text-[12px] text-[var(--v2-text)]">
              <span className="font-semibold">Refresh warning:</span> {errorInfo.message}
              <div className="mt-2">
                <V2Button variant="secondary" size="sm" onClick={() => void load()}>
                  Retry refresh
                </V2Button>
              </div>
            </div>
          ) : null}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-[var(--v2-text)]">Active</div>
              <div className="text-[12px] text-[var(--v2-muted)]">{active.length}</div>
            </div>
            {active.length === 0 ? (
              <V2Card>
                <V2CardHeader title="No active orders" subtitle="You’re all caught up." />
                <V2CardBody>
                  <div className="text-sm text-[var(--v2-muted)]">Completed/canceled orders are in history.</div>
                </V2CardBody>
              </V2Card>
            ) : list(active)}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-[var(--v2-text)]">History</div>
              <div className="text-[12px] text-[var(--v2-muted)]">{history.length}</div>
            </div>
            {history.length === 0 ? (
              <V2Card>
                <V2CardHeader title="No history" subtitle="No completed P2P orders yet." />
                <V2CardBody>
                  <div className="text-sm text-[var(--v2-muted)]">Once you finish a trade, it’ll appear here.</div>
                </V2CardBody>
              </V2Card>
            ) : list(history.slice(0, 30))}
          </section>
        </div>
      )}
    </main>
  );
}
