"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPaymentMethodName } from "@/lib/p2p/constants";
import { paymentMethodBadge, safePaymentMethods } from "@/lib/p2p/display";

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
  const repLabel = repTotal >= 3 && repPct !== null ? `${repPct}% positive (${repTotal})` : repTotal > 0 ? `New (${repTotal})` : "New";

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

  const getCreateOrderErrorMessage = (errorCode?: string, fallback?: string) => {
    switch (errorCode) {
      case "seller_payment_details_missing":
        return "Seller payment details are missing. Please choose another ad or ask the seller to update payment details.";
      case "seller_payment_method_required":
        return "Select your payment method before creating this sell order.";
      case "invalid_seller_payment_method":
        return "The selected payment method is invalid. Please choose another method.";
      default:
        return fallback || "Failed to create order";
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
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for safety

    try {
      const res = await fetch("/api/p2p/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad_id: ad.id,
          amount_fiat: parseFloat(amountFiat),
          payment_method_id: isSelling ? selectedMethodId : undefined
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle non-JSON responses gracefully
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("Server Error: " + text.slice(0, 100));
      }

      if (!res.ok) {
        throw new Error(getCreateOrderErrorMessage(data.error, data.message));
      }

      router.push(`/p2p/orders/${data.order_id}`);
      
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError("Request timed out. The server took too long to respond.");
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
                  <span aria-hidden>•</span>
                  <span>Pay within {ad.payment_window} min</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--card-2)]"
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
               className="flex-1 rounded-lg py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-2)] transition"
             >
                Cancel
             </button>
             <button 
               type="submit" 
               disabled={loading || !amountFiat}
               className="flex-1 rounded-lg bg-[var(--accent)] py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
             >
                {loading ? "Processing..." : `${myAction} ${ad.asset}`}
             </button>
           </div>
        </form>
      </div>
    </div>
  );
}
