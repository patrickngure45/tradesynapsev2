"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type AdSnapshot = {
  id: string;
  side: "BUY" | "SELL"; // This is AD side. If SELL, I am BUYING.
  price: string;
  asset: string;
  fiat: string;
  min: string;
  max: string;
  payment_window: number;
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

  const myAction = ad.side === "SELL" ? "Buy" : "Sell";
  const isSelling = myAction === "Sell";

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

      if (!res.ok) throw new Error(data.message || "Failed to create order");

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
      
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-6 py-4">
           <h2 className="text-lg font-bold">{myAction} {ad.asset}</h2>
           <p className="text-xs text-[var(--muted)]">
             Price: {ad.price} {ad.fiat}
           </p>
        </div>

        <form onSubmit={handleCreateOrder} className="p-6 space-y-6">
           {error && (
             <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
               {error}
             </div>
           )}

           {isSelling && (
               <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Receive Payment To</label>
                  {fetchingMethods ? <div className="text-xs text-[var(--muted)]">Loading methods...</div> : (
                     <div>
                         <select
                            value={selectedMethodId}
                            onChange={e => setSelectedMethodId(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                         >
                            {myMethods.length === 0 && <option value="">No methods found</option>}
                            {myMethods.map(m => (
                               <option key={m.id} value={m.id}>{m.name} ({m.identifier})</option>
                            ))}
                         </select>
                         {myMethods.length === 0 && (
                            <p className="text-[10px] text-red-400 mt-1">
                                You need to add a payment method to sell. Close this and post an Ad to add one, or go to profile.
                            </p>
                         )}
                     </div>
                  )}
               </div>
           )}

           <div>
             <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                I will pay ({ad.fiat})
             </label>
             <input 
               type="number"
               autoFocus
               placeholder={`${ad.min} - ${ad.max}`}
               value={amountFiat}
               onChange={e => setAmountFiat(e.target.value)}
               className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-lg font-mono outline-none focus:border-[var(--accent)]"
             />
             <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
               <span>Limit: {Number(ad.min).toLocaleString()} - {Number(ad.max).toLocaleString()}</span>
             </div>
           </div>

           <div className="flex items-center justify-center">
              <span className="text-[var(--muted)]">↓</span>
           </div>

           <div>
             <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                I will receive ({ad.asset})
             </label>
             <div className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-4 py-3 text-lg font-mono text-[var(--fg)]">
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
               className="flex-1 rounded-lg py-3 text-sm font-medium hover:bg-[var(--bg)] transition"
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
