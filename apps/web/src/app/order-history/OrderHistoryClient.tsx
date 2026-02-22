"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { fetchJsonOrThrow } from "@/lib/api/client";

type Fill = {
  id: string;
  price: string;
  quantity: string;
  maker_fee: string;
  taker_fee: string;
  created_at: string;
};

type Order = {
  id: string;
  market_id: string;
  market_symbol: string;
  side: string;
  type: string;
  price: string;
  quantity: string;
  remaining_quantity: string;
  iceberg_display_quantity?: string | null;
  iceberg_hidden_remaining?: string;
  status: string;
  created_at: string;
  updated_at: string;
  fills: Fill[];
};

type ExplainOrderResponse = {
  ok: true;
  kind: "exchange_order";
  id: string;
  status: string;
  state: string;
  summary: string;
  blockers: string[];
  next_steps: string[];
  ai?: unknown;
};

export function OrderHistoryClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [explainById, setExplainById] = useState<Record<string, { summary: string; blockers: string[]; next_steps: string[] } | null>>({});
  const [explainErrorById, setExplainErrorById] = useState<Record<string, string | null>>({});

  const fetchOrders = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchJsonOrThrow<{ orders?: Order[] }>(
        `/api/exchange/orders/history?status=${encodeURIComponent(statusFilter)}&limit=100`,
        { cache: "no-store" },
      );
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order history");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const loadExplain = useCallback(async (id: string) => {
    if (Object.prototype.hasOwnProperty.call(explainById, id)) return;
    setExplainErrorById((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await fetchJsonOrThrow<ExplainOrderResponse>(`/api/explain/order?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      setExplainById((prev) => ({
        ...prev,
        [id]: {
          summary: String(res.summary ?? ""),
          blockers: Array.isArray(res.blockers) ? res.blockers.map((x) => String(x)) : [],
          next_steps: Array.isArray(res.next_steps) ? res.next_steps.map((x) => String(x)) : [],
        },
      }));
    } catch (e) {
      setExplainById((prev) => ({ ...prev, [id]: null }));
      setExplainErrorById((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : "Failed to load explanation",
      }));
    }
  }, [explainById]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const willExpand = !next.has(id);
      if (willExpand) next.add(id);
      else next.delete(id);
      return next;
    });
    void loadExplain(id);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      open: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[var(--border)]",
      partially_filled: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[var(--warn)] border-[var(--border)]",
      filled: "bg-[color-mix(in_srgb,var(--up)_10%,transparent)] text-[var(--up)] border-[var(--border)]",
      canceled: "bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]",
    };
    return map[status] ?? "bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]";
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {["all", "open", "partially_filled", "filled", "canceled"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setLoading(true); }}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              statusFilter === s
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {s === "partially_filled" ? "Partial" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--muted)]">Loading...</div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-sm text-rose-400">
          {error}
          <button onClick={() => { setLoading(true); fetchOrders(); }} className="ml-3 underline hover:text-rose-300">Retry</button>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <p className="text-[var(--muted)]">No spot orders found matching criteria.</p>
            <div className="text-sm">
                Looking for P2P trades? <Link href="/p2p/orders" className="text-[var(--accent)] hover:underline">View P2P Order History</Link>
            </div>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const isExpanded = expanded.has(order.id);
            const hiddenRem = order.iceberg_display_quantity ? parseFloat(String(order.iceberg_hidden_remaining ?? "0")) : 0;
            const remainingTotal = parseFloat(order.remaining_quantity) + (Number.isFinite(hiddenRem) ? hiddenRem : 0);
            const filledQty = parseFloat(order.quantity) - remainingTotal;
            const fillPct =
              parseFloat(order.quantity) > 0
                ? (((Math.max(0, filledQty) / parseFloat(order.quantity)) * 100)).toFixed(1)
                : "0";

            return (
              <div
                key={order.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(order.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-[var(--background)]/50"
                >
                  <div className="min-w-[90px]">
                    <div className="font-mono text-sm font-medium">{order.market_symbol}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {order.type}
                      {order.iceberg_display_quantity ? (
                        <> · iceberg {order.iceberg_display_quantity} · hid {String(order.iceberg_hidden_remaining ?? "0")}</>
                      ) : null}
                    </div>
                  </div>

                  <span
                    className={`text-sm font-semibold ${
                      order.side === "buy" ? "text-[var(--up)]" : "text-[var(--down)]"
                    }`}
                  >
                    {order.side.toUpperCase()}
                  </span>

                  <div className="text-right">
                    <div className="font-mono text-sm">{parseFloat(order.price).toFixed(4)}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {filledQty.toFixed(4)} / {parseFloat(order.quantity).toFixed(4)}
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusBadge(order.status)}`}>
                      {order.status} ({fillPct}%)
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    <svg
                      className={`h-4 w-4 text-[var(--muted)] transition ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && order.fills.length > 0 && (
                  <div className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <div className="mb-2 text-xs font-medium text-[var(--muted)]">
                      Fills ({order.fills.length})
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[var(--muted)]">
                          <th className="pb-1">Price</th>
                          <th className="pb-1">Qty</th>
                          <th className="pb-1">Maker Fee</th>
                          <th className="pb-1">Taker Fee</th>
                          <th className="pb-1 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.fills.map((f) => (
                          <tr key={f.id} className="border-t border-[var(--border)]/30">
                            <td className="py-1 font-mono">{parseFloat(f.price).toFixed(4)}</td>
                            <td className="py-1 font-mono">{parseFloat(f.quantity).toFixed(4)}</td>
                            <td className="py-1 font-mono">{parseFloat(f.maker_fee).toFixed(6)}</td>
                            <td className="py-1 font-mono">{parseFloat(f.taker_fee).toFixed(6)}</td>
                            <td className="py-1 text-right text-[var(--muted)]">
                              {new Date(f.created_at).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {isExpanded && order.fills.length === 0 && (
                  <div className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 text-xs text-[var(--muted)]">
                    No fills yet
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <div className="mb-2 text-xs font-medium text-[var(--muted)]">Status explanation</div>
                    {explainErrorById[order.id] ? (
                      <div className="text-xs text-[var(--muted)]">{explainErrorById[order.id]}</div>
                    ) : explainById[order.id] ? (
                      <div className="grid gap-2">
                        <div className="text-sm font-semibold text-[var(--foreground)]">{explainById[order.id]!.summary}</div>
                        {explainById[order.id]!.next_steps.length > 0 && (
                          <ul className="list-disc pl-5 text-xs text-[var(--muted)]">
                            {explainById[order.id]!.next_steps.slice(0, 3).map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--muted)]">Loading…</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
