import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import type { ClientApiError } from "@/components/ApiErrorBanner";
import type { ToastKind } from "@/components/Toast";
import { fromBigInt3818, toBigInt3818 } from "@/lib/exchange/fixed3818";

import type { Order } from "../types";

export function MyOrdersPanel(props: {
  nowMs: number;
  marketId: string;
  authMode: "session" | "header";
  canUseHeader: boolean;
  requestHeaders: Record<string, string> | undefined;
  ordersSorted: Order[];
  openOrders: Order[];
  closedOrders: Order[];
  qtyDigits: number;
  priceDigits: number;
  cancelAllLoading: boolean;
  setCancelAllLoading: (next: boolean) => void;
  cancelingOrderId: string | null;
  setCancelingOrderId: (next: string | null) => void;
  refresh: (opts?: { silent?: boolean; updateMarketdataTimestamp?: boolean }) => Promise<void>;
  setError: (err: ClientApiError | null) => void;
  setToastKind: (kind: ToastKind) => void;
  setToastMessage: (msg: string | null) => void;
  setSide: (next: "buy" | "sell") => void;
  setPrice: (next: string) => void;
  setQuantity: (next: string) => void;
  setLoadedOrderId: (next: string | null) => void;
  formatDecimal: (value: string, digits: number) => string;
}) {
  const {
    nowMs,
    marketId,
    authMode,
    canUseHeader,
    requestHeaders,
    ordersSorted,
    openOrders,
    closedOrders,
    qtyDigits,
    priceDigits,
    cancelAllLoading,
    setCancelAllLoading,
    cancelingOrderId,
    setCancelingOrderId,
    refresh,
    setError,
    setToastKind,
    setToastMessage,
    setSide,
    setPrice,
    setQuantity,
    setLoadedOrderId,
    formatDecimal,
  } = props;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <h3 className="text-sm font-medium">My orders</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">Orders only show when authenticated.</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-[var(--border)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
          disabled={cancelAllLoading || (authMode === "header" && !canUseHeader) || !marketId || openOrders.length === 0}
          title="Cancels all open orders in the current market."
          onClick={async () => {
            if (!marketId) return;
            if (openOrders.length === 0) return;
            if (!confirm(`Cancel all ${openOrders.length} open order(s)?`)) return;
            setCancelAllLoading(true);
            setError(null);
            try {
              for (const o of openOrders) {
                setCancelingOrderId(o.id);
                await fetchJsonOrThrow(`/api/exchange/orders/${o.id}/cancel`, {
                  method: "POST",
                  headers: requestHeaders,
                });
              }
              setToastKind("success");
              setToastMessage(`Canceled ${openOrders.length} order(s).`);
              await refresh({ silent: true, updateMarketdataTimestamp: false });
            } catch (e) {
              if (e instanceof ApiError) setError({ code: e.code, details: e.details });
              else setError({ code: e instanceof Error ? e.message : String(e) });
            } finally {
              setCancelingOrderId(null);
              setCancelAllLoading(false);
            }
          }}
        >
          {cancelAllLoading ? "Canceling…" : "Cancel all open"}
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        {ordersSorted.length === 0 ? (
          <div className="text-xs text-[var(--muted)]">—</div>
        ) : (
          <>
            <div className="text-[11px] text-[var(--muted)]">Open</div>
            {openOrders.length === 0 ? (
              <div className="text-xs text-[var(--muted)]">—</div>
            ) : (
              openOrders.map((o) => {
                let filled: string | null = null;
                try {
                  const qBi = toBigInt3818(o.quantity);
                  const rBi = toBigInt3818(o.remaining_quantity);
                  if (rBi <= qBi) filled = fromBigInt3818(qBi - rBi);
                } catch {
                  filled = null;
                }

                const ageSec = (() => {
                  const t = Date.parse(o.created_at);
                  if (!Number.isFinite(t)) return null;
                  return Math.max(0, Math.floor((nowMs - t) / 1000));
                })();

                const sideCls = o.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

                const canceling = cancelingOrderId === o.id;

                return (
                  <div
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        <span className={sideCls}>{o.side.toUpperCase()}</span>
                        <span className="font-mono">
                          {formatDecimal(o.remaining_quantity, qtyDigits)}/{formatDecimal(o.quantity, qtyDigits)}
                        </span>
                        <span className="text-[var(--muted)]">@</span>
                        <span className="font-mono">{formatDecimal(o.price, priceDigits)}</span>
                        <span className="text-[var(--muted)]">({o.status})</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-3 font-mono text-[11px] text-[var(--muted)]">
                        <span title={o.created_at}>{ageSec == null ? "" : `${ageSec}s ago`}</span>
                        {filled ? <span>filled {formatDecimal(filled, qtyDigits)}</span> : null}
                        <span className="truncate max-w-[8rem]" title={o.id}>{o.id}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-[var(--border)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
                        disabled={authMode === "header" && !canUseHeader}
                        title="Load this order into the ticket (for quick edits / replace via cancel+new)."
                        onClick={() => {
                          setSide(o.side);
                          setPrice(formatDecimal(o.price, priceDigits));
                          setQuantity(formatDecimal(o.remaining_quantity, qtyDigits));
                          setLoadedOrderId(o.id);
                        }}
                      >
                        Load
                      </button>

                      <button
                        type="button"
                        className="rounded border border-[var(--border)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
                        disabled={
                          cancelAllLoading ||
                          canceling ||
                          (authMode === "header" && !canUseHeader) ||
                          !(o.status === "open" || o.status === "partially_filled")
                        }
                        onClick={async () => {
                          setCancelingOrderId(o.id);
                          setError(null);
                          try {
                            await fetchJsonOrThrow(`/api/exchange/orders/${o.id}/cancel`, {
                              method: "POST",
                              headers: requestHeaders,
                            });
                            setToastKind("success");
                            setToastMessage("Order canceled.");
                            await refresh({ silent: true, updateMarketdataTimestamp: false });
                          } catch (e) {
                            if (e instanceof ApiError) setError({ code: e.code, details: e.details });
                            else setError({ code: e instanceof Error ? e.message : String(e) });
                          } finally {
                            setCancelingOrderId(null);
                          }
                        }}
                      >
                        {canceling ? "Canceling…" : "Cancel"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            <div className="mt-2 text-[11px] text-[var(--muted)]">Recent</div>
            {closedOrders.length === 0 ? (
              <div className="text-xs text-[var(--muted)]">—</div>
            ) : (
              closedOrders.slice(0, 10).map((o) => (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      <span className={o.side === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                        {o.side.toUpperCase()}
                      </span>
                      <span className="font-mono">
                        {formatDecimal(o.remaining_quantity, qtyDigits)}/{formatDecimal(o.quantity, qtyDigits)}
                      </span>
                      <span className="text-[var(--muted)]">@</span>
                      <span className="font-mono">{formatDecimal(o.price, priceDigits)}</span>
                      <span className="text-[var(--muted)]">({o.status})</span>
                    </div>
                    <div className="mt-0.5 truncate max-w-[8rem] font-mono text-[11px] text-[var(--muted)]" title={o.id}>{o.id}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-[var(--border)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
                    disabled={authMode === "header" && !canUseHeader}
                    onClick={() => {
                      setSide(o.side);
                      setPrice(formatDecimal(o.price, priceDigits));
                      setQuantity(formatDecimal(o.remaining_quantity, qtyDigits));
                      setLoadedOrderId(o.id);
                    }}
                  >
                    Load
                  </button>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
