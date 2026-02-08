
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteChrome } from "@/components/SiteChrome";

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
};

export default function P2POrdersListPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/p2p/orders")
      .then((res) => res.json())
      .then((data) => {
        if (data.orders) setOrders(data.orders);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const activeOrders = orders.filter(o => ['created', 'paid_confirmed'].includes(o.status));
  const pastOrders = orders.filter(o => !['created', 'paid_confirmed'].includes(o.status));

  return (
    <SiteChrome>
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">My P2P Orders</h1>
              <p className="text-sm text-[var(--muted)]">Track your active trades and history</p>
            </div>
            <Link href="/p2p" className="text-sm text-[var(--accent)] hover:underline">
              ← Back to Marketplace
            </Link>
        </header>

        {loading ? (
             <div className="text-center py-12 text-[var(--muted)]">Loading orders...</div>
        ) : (
            <div className="space-y-8">
                {/* ACTIVE */}
                <section>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        Active Orders 
                        <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">{activeOrders.length}</span>
                    </h2>
                    {activeOrders.length === 0 ? (
                        <div className="text-sm text-[var(--muted)] italic p-4 border border-[var(--border)] rounded-lg bg-[var(--card)]">
                            No active orders.
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {activeOrders.map(order => <OrderCard key={order.id} order={order} />)}
                        </div>
                    )}
                </section>

                {/* PAST */}
                 <section>
                    <h2 className="text-lg font-bold mb-4 text-[var(--muted)]">History</h2>
                     {pastOrders.length === 0 ? (
                        <div className="text-sm text-[var(--muted)] italic">No history yet.</div>
                    ) : (
                         <div className="grid gap-4 opacity-75">
                            {pastOrders.map(order => <OrderCard key={order.id} order={order} />)}
                        </div>
                    )}
                </section>
            </div>
        )}
      </div>
    </SiteChrome>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
    const isBuy = order.my_side === 'BUY';
    const colorClass = isBuy ? "text-[var(--up)]" : "text-[var(--down)]";
    
    // Status badges
    const statusColors: Record<string, string> = {
        created: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        paid_confirmed: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        completed: "bg-green-500/10 text-green-500 border-green-500/20",
        cancelled: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    };

    return (
        <Link href={`/p2p/orders/${order.id}`}>
            <div className="group relative flex items-center justify-between overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)] hover:shadow-lg">
                <div className="flex gap-4 items-center">
                    <div className={`text-xl font-bold uppercase w-16 text-center ${colorClass}`}>
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
                     <span className={`text-xs px-2 py-1 rounded border font-mono uppercase ${statusColors[order.status] || "bg-gray-800"}`}>
                         {order.status.replace('_', ' ')}
                     </span>
                     <span className="text-[10px] text-[var(--muted)]">
                         {new Date(order.created_at).toLocaleString()}
                     </span>
                </div>
            </div>
        </Link>
    );
}
