"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPaymentMethodName } from "@/lib/p2p/constants";
import { paymentMethodBadge, safePaymentMethods } from "@/lib/p2p/display";
import { buttonClassName } from "@/components/ui/Button";
import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";

type ApiErrorResponse = {
  error?: string;
  message?: string;
  details?: any;
};

type AdSnapshot = {
  id: string;
  side: "BUY" | "SELL"; // This is AD side. If SELL, I am BUYING.
  price: string;
  asset: string;
  fiat: string;
  min: string;
  max: string;
  payment_window: number;
  trader?: string | null;
  trader_rep?: { positive: number; total: number } | null;
  trader_completed?: number | null;
  trader_verified?: boolean | null;
  payment_methods?: string[] | null;
  terms?: string | null;
};

type UserPaymentMethod = { id: string; identifier: string; name: string; }; // Minimal type


export function TakeAdModal({ ad, onClose }: { ad: AdSnapshot, onClose: () => void }) {
  const router = useRouter();
  const [amountFiat, setAmountFiat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment Methods (for Taker-Seller)
  const [myMethods, setMyMethods] = useState<UserPaymentMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const [fetchingMethods, setFetchingMethods] = useState(false);

  const [refMid, setRefMid] = useState<number | null>(null);

  const myAction = ad.side === "SELL" ? "Buy" : "Sell";
  const isSelling = myAction === "Sell";

  const rails = safePaymentMethods(ad.payment_methods);
  const traderLabel = String(ad.trader ?? "").trim();

  const repTotal = Number(ad.trader_rep?.total ?? 0);
  const repPositive = Number(ad.trader_rep?.positive ?? 0);
  const repPct = repTotal > 0 ? Math.round((repPositive / repTotal) * 100) : null;
  const isVerifiedTrader = Boolean(ad.trader_verified);
  const completedCount = Number(ad.trader_completed ?? 0);
  const completedLabel = Number.isFinite(completedCount) && completedCount > 0 ? `${completedCount} completed` : null;
  const repLabel =
    repTotal >= 3 && repPct !== null
      ? `${repPct}% (${repTotal})`
      : isVerifiedTrader
        ? "Verified"
        : repTotal > 0
          ? `New (${repTotal})`
          : Number.isFinite(completedCount) && completedCount > 0
            ? "No feedback"
            : "New";

  useEffect(() => {
    fetch(`/api/p2p/reference?asset=${encodeURIComponent(ad.asset)}&fiat=${encodeURIComponent(ad.fiat)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const mid = typeof data?.mid === "number" ? data.mid : Number(data?.mid);
        setRefMid(Number.isFinite(mid) && mid > 0 ? mid : null);
      })
      .catch(() => setRefMid(null));
  }, [ad.asset, ad.fiat]);

  useEffect(() => {
     if (isSelling) {
        setFetchingMethods(true);
        fetch('/api/p2p/payment-methods')
          .then(r => r.ok ? r.json() : { methods: [] })
          .then(d => {
             setMyMethods(d.methods);
             if (d.methods && d.methods.length > 0) setSelectedMethodId(d.methods[0].id);
          })
          .catch(console.error)
          .finally(() => setFetchingMethods(false));
     }
  }, [isSelling]);

  // If Ad is SELL, I am buying. Ad Price is how much fiat I pay per crypto.
  // Fiat / Price = Crypto
  const getCryptoAmount = () => {
    const f = parseFloat(amountFiat);
    const p = parseFloat(ad.price);
    if (!f || !p) return "0.00";
    return (f / p).toFixed(6);
  };

  const humanizeErrorCode = (code: string) =>
    code
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const getCreateOrderErrorMessage = (resp?: ApiErrorResponse) => {
    const errorCode = String(resp?.error ?? "").trim() || undefined;
    const fallback = String(resp?.message ?? "").trim() || undefined;
    const details = resp?.details as any;

    switch (errorCode) {
      case "csrf_no_origin":
      case "csrf_origin_mismatch":
      case "csrf_referer_mismatch":
      case "csrf_invalid_referer":
      case "csrf_token_mismatch":
        return "Security check failed for this request. Please refresh the page and try again.";
      case "p2p_busy":
        return "This ad is being taken by someone else right now. Please try again in a few seconds.";
      case "ad_not_found":
        return "This ad no longer exists. Please refresh the marketplace.";
      case "ad_is_not_online":
        return "This ad is not online anymore. Please choose another ad.";
      case "cannot_trade_own_ad":
        return "You can’t trade on your own ad.";
      case "amount_out_of_bounds":
        return `Amount must be between ${Number(ad.min).toLocaleString()} and ${Number(ad.max).toLocaleString()} ${ad.fiat}.`;
      case "insufficient_liquidity_on_ad":
        return "This ad doesn’t have enough remaining liquidity for that amount. Try a smaller amount or another ad.";
      case "seller_insufficient_funds":
        return `Seller doesn’t have enough ${ad.asset} available for escrow right now. Try a smaller amount or another ad.`;
      case "p2p_price_out_of_band":
        return "This ad’s price is too far from the current reference rate. Please refresh and choose another ad.";
      case "seller_payment_details_missing":
        return "Seller payment details are missing. Please choose another ad.";
      case "seller_payment_method_required":
        return "Select your payment method before creating this sell order.";
      case "invalid_seller_payment_method":
        return "The selected payment method is invalid. Please choose another method.";
      case "p2p_open_orders_limit": {
        const max = typeof details?.max === "number" ? details.max : null;
        const open = typeof details?.open === "number" ? details.open : null;
        if (max && open !== null) return `You already have ${open} open orders. Please complete or cancel one before creating another (limit: ${max}).`;
        return "You have too many open orders. Please complete or cancel one before creating another.";
      }
      case "p2p_order_create_cooldown": {
        const ends = typeof details?.cooldown_ends_at === "string" ? details.cooldown_ends_at : null;
        return ends
          ? `You’re temporarily blocked from creating new orders due to repeated payment timeouts. Try again after ${new Date(ends).toLocaleString()}.`
          : "You’re temporarily blocked from creating new orders due to repeated payment timeouts. Please try again later.";
      }
      case "rate_limit_exceeded": {
        const resetMs = typeof details?.resetMs === "number" ? details.resetMs : null;
        if (resetMs && resetMs > 0) return `Too many attempts. Please try again in ${Math.max(1, Math.ceil(resetMs / 1000))}s.`;
        return "Too many attempts. Please try again in a moment.";
      }
      case "p2p_country_not_supported":
        return "P2P is not available in your country yet.";
      case "unauthorized":
      case "missing_x_user_id":
      case "missing_user_id":
      case "session_token_expired":
        return "Your session has expired. Please log in again.";
      case "invalid_input":
        return "Invalid input. Please double-check the amount and try again.";
      default: {
        if (fallback) return fallback;
        if (errorCode) {
          const msg = humanizeErrorCode(errorCode);
          return process.env.NODE_ENV === "development" ? `${msg} (${errorCode})` : msg;
        }
        return "Failed to create order";
      }
    }
  };
  
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isSelling && !selectedMethodId) {
        setError("Please select a payment method to receive funds.");
        setLoading(false);
        return;
    }

    const controller = new AbortController();
    // In dev, the first request can include a large one-time cost (Next route compilation).
    // Avoid showing a false "timeout" to users during local development.
    const timeoutMs = process.env.NODE_ENV === "development" ? 60_000 : 20_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const data = await fetchJsonOrThrow<{ success: true; order_id: string }>(
        "/api/p2p/orders",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ad_id: ad.id,
            amount_fiat: parseFloat(amountFiat),
            payment_method_id: isSelling ? selectedMethodId : undefined,
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      router.push(`/p2p/orders/${data.order_id}`);
      
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(
          `Request timed out after ${Math.round(timeoutMs / 1000)}s. The server took too long to respond.`,
        );
      } else if (err instanceof ApiError) {
        // If the server says an open order already exists for this ad, route there.
        if (err.code === "p2p_order_duplicate_open") {
          const details: any = err.details;
          if (details && typeof details.order_id === "string" && details.order_id) {
            router.push(`/p2p/orders/${details.order_id}`);
            return;
          }
        }

        const resp: ApiErrorResponse = {
          error: err.code,
          message: typeof err.details === "string" ? err.details : undefined,
          details: typeof err.details === "object" ? err.details : undefined,
        };
        setError(getCreateOrderErrorMessage(resp));
      } else {
        setError(err.message);
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] animate-in fade-in zoom-in-95 duration-200"
        style={{ clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 16% 18%, var(--ring) 0, transparent 55%), radial-gradient(circle at 82% 72%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative border-b border-[var(--border)] bg-[var(--card-2)] px-6 py-4">
          <div
            className="pointer-events-none absolute inset-0 opacity-55"
            aria-hidden
            style={{
              backgroundImage:
                "radial-gradient(circle at 18% 40%, var(--ring) 0, transparent 55%), radial-gradient(circle at 78% 60%, var(--ring) 0, transparent 55%)",
            }}
          />

          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-extrabold tracking-tight text-[var(--foreground)]">
                  {myAction} {ad.asset}
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {traderLabel ? <span className="normal-case font-semibold">{traderLabel}</span> : null}
                  {traderLabel ? <span aria-hidden>•</span> : null}
                  <span className="normal-case">{repLabel}</span>
                  {completedLabel ? (
                    <>
                      <span aria-hidden>•</span>
                      <span className="normal-case">{completedLabel}</span>
                    </>
                  ) : null}
                  <span aria-hidden>•</span>
                  <span>{ad.payment_window}m window</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className={buttonClassName({ variant: "secondary", size: "xs", className: "shrink-0 h-8 w-8 rounded-full p-0" })}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-2 text-xs text-[var(--muted)]">
              <div>
                Price: <span className="font-semibold text-[var(--foreground)]">{Number(ad.price).toLocaleString()}</span> {ad.fiat}/{ad.asset}
              </div>
              {refMid ? (
                <div className="mt-0.5 text-[10px]">Reference: ~{refMid.toLocaleString()} {ad.fiat}/{ad.asset}</div>
              ) : null}
            </div>

            {rails.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {rails.map((r) => {
                  const b = paymentMethodBadge(r);
                  return (
                    <span key={r} className={b.className}>
                      {b.label}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleCreateOrder} className="p-6 space-y-6">
           {error && (
             <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
               {error}
             </div>
           )}

           {ad.terms ? (
             <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-3 text-xs text-[var(--muted)]">
               <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Terms</div>
               <div className="mt-1 whitespace-pre-wrap leading-relaxed">{ad.terms}</div>
             </div>
           ) : null}

           {isSelling && (
               <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Receive Payment To</label>
                  {fetchingMethods ? <div className="text-xs text-[var(--muted)]">Loading methods...</div> : (
                     <div>
                         <select
                            value={selectedMethodId}
                            onChange={e => setSelectedMethodId(e.target.value)}
                           className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                         >
                            {myMethods.length === 0 && <option value="">No methods found</option>}
                            {myMethods.map(m => (
                               <option key={m.id} value={m.id}>
                                {m.name} — {getPaymentMethodName(m.identifier)}
                               </option>
                            ))}
                         </select>
                         {myMethods.length === 0 && (
                            <p className="text-[10px] text-red-400 mt-1">
                            No payout methods found. Add a payment method in your profile before selling.
                            </p>
                         )}
                     </div>
                  )}
               </div>
           )}

           <div>
             <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
               Amount ({ad.fiat})
             </label>
             <div className="relative">
               <input
                 type="number"
                 inputMode="decimal"
                 autoFocus
                 placeholder={`${ad.min} - ${ad.max}`}
                 value={amountFiat}
                 onChange={e => setAmountFiat(e.target.value)}
                 className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 pr-16 py-3 text-lg font-mono tabular-nums text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                 aria-label={`Amount in ${ad.fiat}`}
               />
               <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3" aria-hidden>
                 <span className="rounded-md border border-[var(--border)] bg-[var(--card-2)] px-2 py-1 text-[10px] font-bold text-[var(--muted)]">
                   {ad.fiat}
                 </span>
               </div>
             </div>
             <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
               <span>Limits: {Number(ad.min).toLocaleString()} – {Number(ad.max).toLocaleString()} {ad.fiat}</span>
             </div>
           </div>

           <div className="flex items-center justify-center">
              <span className="text-[var(--muted)]">↓</span>
           </div>

           <div>
             <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
               You receive ({ad.asset})
             </label>
             <div className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-4 py-3 text-lg font-mono text-[var(--foreground)]">
                {getCryptoAmount()}
             </div>
           </div>

           <div className="rounded bg-[var(--accent)]/5 p-3 text-center text-xs text-[var(--accent)]">
              Funds will be held in secure escrow until payment is confirmed.
           </div>

           <div className="flex gap-3 pt-2">
             <button 
               type="button" 
               onClick={onClose}
               className={buttonClassName({ variant: "secondary", size: "md", className: "flex-1 py-3" })}
             >
                Cancel
             </button>
             <button 
               type="submit" 
               disabled={loading || !amountFiat}
               className={buttonClassName({ variant: "primary", size: "md", className: "flex-1 py-3" })}
             >
                {loading ? "Processing..." : `${myAction} ${ad.asset}`}
             </button>
           </div>
        </form>
      </div>
    </div>
  );
}
