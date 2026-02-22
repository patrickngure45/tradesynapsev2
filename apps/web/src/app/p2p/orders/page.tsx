
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SiteChrome } from "@/components/SiteChrome";
import { fetchJsonOrThrow } from "@/lib/api/client";

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

export default function P2POrdersListPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchJsonOrThrow<{ orders?: any[] }>("/api/p2p/orders", { cache: "no-store" });
            setOrders(Array.isArray(data.orders) ? (data.orders as any[]) : []);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, []);

  useEffect(() => {
        void load();
        const t = setInterval(load, 30_000);
        return () => clearInterval(t);
    }, [load]);

    const { activeOrdersSorted, pastOrders, missingDetailsCount } = useMemo(() => {
        const activeOrders = orders.filter((o) => ["created", "paid_confirmed", "disputed"].includes(o.status));
        const pastOrders = orders.filter((o) => !["created", "paid_confirmed", "disputed"].includes(o.status));

        const activeOrdersSorted = [...activeOrders].sort((a, b) => {
            const aMissing = a.payment_details_ready ? 1 : 0;
            const bMissing = b.payment_details_ready ? 1 : 0;
            if (aMissing !== bMissing) return aMissing - bMissing;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return {
            activeOrdersSorted,
            pastOrders,
            missingDetailsCount: activeOrders.filter((order) => !order.payment_details_ready).length,
        };
    }, [orders]);

  return (
    <SiteChrome>
            <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
                <section className="relative mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
                    <div
                        className="pointer-events-none absolute inset-0 opacity-60"
                        aria-hidden
                        style={{
                            backgroundImage:
                                "radial-gradient(circle at 18% 20%, var(--ring) 0, transparent 55%), radial-gradient(circle at 86% 72%, var(--ring) 0, transparent 55%)",
                        }}
                    />
                    <div className="relative p-6 md:p-7">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <div className="flex items-center gap-3">
                                    <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                                        <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                                        <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
                                    </span>
                                    <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">P2P</div>
                                    <div className="h-px flex-1 bg-[var(--border)]" />
                                </div>
                                <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[var(--foreground)] md:text-3xl">
                                    My orders
                                </h1>
                                <p className="mt-2 text-sm text-[var(--muted)]">Active trades first, then your history.</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={load}
                                    className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)] disabled:opacity-60"
                                    disabled={loading}
                                >
                                    {loading ? "Refreshing…" : "Refresh"}
                                </button>
                                <Link
                                    href="/p2p"
                                    className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]"
                                >
                                    Marketplace
                                </Link>
                            </div>
                        </div>

                        {missingDetailsCount > 0 ? (
                            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--warn)_10%,var(--bg))] px-4 py-3 text-xs text-[var(--foreground)]">
                                <span className="font-semibold">Action needed:</span> {missingDetailsCount} active {missingDetailsCount === 1 ? "order is" : "orders are"} missing seller payment details.
                            </div>
                        ) : null}
                    </div>
                </section>

                <div className="space-y-8">
                    <section>
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-sm font-semibold text-[var(--foreground)]">Active</div>
                            <div className="text-[11px] text-[var(--muted)]">{activeOrdersSorted.length}</div>
                        </div>

                        {loading && orders.length === 0 ? (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-xs text-[var(--muted)]">
                                Loading orders…
                            </div>
                        ) : activeOrdersSorted.length === 0 ? (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-xs text-[var(--muted)]">
                                No active P2P orders.
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {activeOrdersSorted.map((order) => (
                                    <OrderCard key={order.id} order={order} showPaymentDetailsBadge />
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-sm font-semibold text-[var(--muted)]">History</div>
                            <div className="text-[11px] text-[var(--muted)]">{pastOrders.length}</div>
                        </div>
                        {pastOrders.length === 0 ? (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-xs text-[var(--muted)]">
                                No history yet.
                            </div>
                        ) : (
                            <div className="grid gap-3 opacity-90">
                                {pastOrders.slice(0, 30).map((order) => (
                                    <OrderCard key={order.id} order={order} />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </main>
    </SiteChrome>
  );
}

function OrderCard({ order, showPaymentDetailsBadge }: { order: OrderSummary; showPaymentDetailsBadge?: boolean }) {
    const isBuy = order.my_side === "BUY";
    const sideTone = isBuy ? "text-[var(--up)]" : "text-[var(--down)]";

    const statusTone = (() => {
        switch (order.status) {
            case "created":
                return { fg: "text-[var(--accent)]", bg: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" };
            case "paid_confirmed":
                return { fg: "text-[var(--warn)]", bg: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]" };
            case "disputed":
                return { fg: "text-[var(--down)]", bg: "bg-[color-mix(in_srgb,var(--down)_10%,transparent)]" };
            case "completed":
                return { fg: "text-[var(--up)]", bg: "bg-[color-mix(in_srgb,var(--up)_10%,transparent)]" };
            case "cancelled":
            default:
                return { fg: "text-[var(--muted)]", bg: "bg-[var(--bg)]" };
        }
    })();

    const created = order.created_at ? new Date(order.created_at).toLocaleString() : "—";

    return (
        <Link href={`/p2p/orders/${order.id}`}>
            <div className="group relative flex items-center justify-between overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)] hover:shadow-lg">
                <div className="flex gap-4 items-center">
                                        <div className={`text-xl font-bold uppercase w-16 text-center ${sideTone}`}>
                        {order.my_side}
                    </div>
                    <div>
                        <div className="font-mono font-medium text-lg">
                            {Number(order.amount_asset).toLocaleString()} {order.asset_symbol}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                             ≈ {Number(order.amount_fiat).toLocaleString()} {order.fiat_currency}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                                    <span
                                        className={`text-[11px] px-2 py-1 rounded-lg border border-[var(--border)] font-mono uppercase ${statusTone.bg} ${statusTone.fg}`}
                                    >
                                        {order.status.replace(/_/g, " ")}
                                    </span>

                                    {showPaymentDetailsBadge ? (
                                        <span
                                            className={
                                                "text-[10px] rounded-full border border-[var(--border)] px-2 py-0.5 font-semibold " +
                                                (order.payment_details_ready
                                                    ? "bg-[color-mix(in_srgb,var(--up)_10%,transparent)] text-[var(--up)]"
                                                    : "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[var(--warn)]")
                                            }
                                        >
                                            {order.payment_details_ready ? "Payment details: ready" : "Payment details: missing"}
                                        </span>
                                    ) : null}

                                    <span className="text-[10px] text-[var(--muted)]">{created}</span>
                </div>
            </div>
        </Link>
    );
}
