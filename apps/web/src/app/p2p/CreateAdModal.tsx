"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ALL_CURRENCIES, PAYMENT_METHODS } from "@/lib/p2p/constants"; // Import constants

type UserPaymentMethod = {
  id: string;
  identifier: string; // e.g. mpesa
  name: string; // e.g. "My Safaricom"
  details: any;
};

function AddMethodForm({ onCancel, onSuccess }: { onCancel: () => void, onSuccess: () => void }) {
  const [type, setType] = useState(PAYMENT_METHODS[0].id);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const selectedType = PAYMENT_METHODS.find(m => m.id === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/p2p/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
           identifier: type,
           name,
           details: fields 
        })
      });
      if (res.ok) {
        onSuccess();
      } else {
        alert("Failed to save method");
      }
    } catch (e) {
      alert("Error saving method");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--bg)] p-4 rounded-lg border border-[var(--border)] mb-4">
       <h3 className="text-sm font-bold mb-3">Add New Payment Account</h3>
       <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-[var(--muted)]">Payment Type</label>
            <select 
               value={type} 
               onChange={e => setType(e.target.value)}
               className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm pt-2"
            >
              {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
             <label className="text-xs text-[var(--muted)]">Account Label (e.g. My M-Pesa)</label>
             <input
               required 
               value={name}
               onChange={e => setName(e.target.value)}
               placeholder="My Account"
               className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
             />
          </div>
          
          {/* Dynamic Fields based on Type */}
          {type === 'bank_transfer' ? (
             <>
               <input placeholder="Bank Name" className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm" 
                 onChange={e => setFields({...fields, bank_name: e.target.value})} required />
               <input placeholder="Account Number" className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm" 
                 onChange={e => setFields({...fields, account_number: e.target.value})} required />
               <input placeholder="Account Name" className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm" 
                 onChange={e => setFields({...fields, account_name: e.target.value})} required />
             </>
          ) : (
             <>
               <input placeholder="Phone / Account Number" className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm" 
                 onChange={e => setFields({...fields, number: e.target.value})} required />
               <input placeholder="Full Name" className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm" 
                 onChange={e => setFields({...fields, name: e.target.value})} required />
             </>
          )}

          <div className="flex gap-2 justify-end mt-2">
             <button type="button" onClick={onCancel} className="text-xs px-3 py-1 bg-gray-600 rounded">Cancel</button>
             <button type="submit" disabled={loading} className="text-xs px-3 py-1 bg-[var(--accent)] rounded font-bold">
               {loading ? 'Saving...' : 'Save Method'}
             </button>
          </div>
       </form>
    </div>
  );
}

export function CreateAdModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Payment Method State
  const [myMethods, setMyMethods] = useState<UserPaymentMethod[]>([]);
  const [fetchingMethods, setFetchingMethods] = useState(false);
  const [showAddMethod, setShowAddMethod] = useState(false);

  // Form State
  const [side, setSide] = useState<"BUY" | "SELL">("SELL");
  const [asset, setAsset] = useState("USDT");
  const [fiat, setFiat] = useState("KES"); // Default to KES

  const [priceType, setPriceType] = useState<"fixed" | "floating">("fixed");
  const [fixedPrice, setFixedPrice] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [minLimit, setMinLimit] = useState("");
  const [maxLimit, setMaxLimit] = useState("");
  const [terms, setTerms] = useState("");
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]); // New State

  const fetchMethods = async () => {
    setFetchingMethods(true);
    try {
        const res = await fetch('/api/p2p/payment-methods');
        if (res.ok) {
            const data = await res.json();
            setMyMethods(data.methods);
        }
    } catch(e) { console.error(e); }
    finally { setFetchingMethods(false); }
  };

  useEffect(() => {
     if (side === "SELL") {
        fetchMethods();
     }
     setSelectedMethods([]);
  }, [side]);

  const toggleMethod = (id: string) => {
    if (selectedMethods.includes(id)) {
      setSelectedMethods(selectedMethods.filter(m => m !== id));
    } else {
      if (selectedMethods.length >= 3) return; // Max 3 methods
      setSelectedMethods([...selectedMethods, id]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (side === "SELL" && selectedMethods.length === 0) {
      setError("Please select at least one payment method.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/p2p/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side,
          asset,
          fiat,
          price_type: priceType,
          fixed_price: parseFloat(fixedPrice),
          total_amount: parseFloat(totalAmount),
          min_limit: parseFloat(minLimit),
          max_limit: parseFloat(maxLimit),
          terms,
          payment_window_minutes: 15,
          payment_methods: side === "SELL" ? selectedMethods : [],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Ad creation failed:", data); // Log to client console
        if (res.status === 401 || data.error === "unauthorized" || data.error === "missing_x_user_id") {
            setError("unauthorized");
        } else {
            // Show detailed error if available, otherwise fallback
            const detail = data.details ? JSON.stringify(data.details) : "";
            setError(data.message ? `${data.message} ${detail}` : "Failed to create ad.");
        }
        return;
      }

      // Success
      router.refresh(); // Refresh server components if any
      // Since P2PMarketplace uses client-side fetch, we might want to trigger a reload there,
      // but closing the modal usually is enough signal to user to refresh or we can callback.
      window.location.reload(); // Brute force refresh for now to see the ad
      onClose();

    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-lg font-semibold">Post P2P Ad</h2>
          <button 
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--hover-bg)]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
              <p className="font-semibold">Creation Failed</p>
              
              {error === "unauthorized" ? (
                <div className="flex flex-col gap-2 mt-1">
                  <p>You are not logged in.</p>
                  <a 
                    href="/api/dev/login" 
                    target="_blank"
                    className="w-fit rounded bg-red-100 px-3 py-1 font-bold text-red-700 hover:bg-red-200"
                  >
                    🛠️ Click here for Dev Login
                  </a>
                  <p className="text-[10px] opacity-70">After logging in, close the new tab and try again.</p>
                </div>
              ) : (
                <>
                  <p>{error}</p>
                </>
              )}
            </div>
          )}

          <div className="space-y-4">
            
            {/* Type & Asset */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">I want to</label>
                <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
                  <button
                    type="button"
                    onClick={() => setSide("SELL")}
                    className={`flex-1 rounded py-1.5 text-xs font-medium transition ${side === "SELL" ? "bg-[var(--down)] text-white" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}
                  >
                    SELL
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide("BUY")}
                    className={`flex-1 rounded py-1.5 text-xs font-medium transition ${side === "BUY" ? "bg-[var(--up)] text-white" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}
                  >
                    BUY
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Asset</label>
                <select 
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="USDT">USDT</option>
                  <option value="BNB">BNB</option>
                </select>
              </div>
            </div>

            {/* Fiat & Price */}
            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Fiat Currency</label>
                <select
                  value={fiat}
                  onChange={(e) => setFiat(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                >
                  {ALL_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
               </div>
               <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Price per unit ({fiat})</label>
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
               </div>
            </div>

            {/* Amount & Limits */}
             <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Total Amount to Trade ({asset})</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
             </div>

             <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Min Limit ({fiat})</label>
                    <input
                      type="number"
                      placeholder="e.g 100"
                      value={minLimit}
                      onChange={(e) => setMinLimit(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                 </div>
                 <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Max Limit ({fiat})</label>
                    <input
                      type="number"
                      placeholder="e.g. 5000"
                      value={maxLimit}
                      onChange={(e) => setMaxLimit(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                 </div>
             </div>
             
             <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                   {side === 'SELL' ? "Receive Payment To (Select Accounts)" : "I will pay via (Select Types)"}
                </label>
                
                {side === 'SELL' ? (
                   <div className="space-y-2">
                      {fetchingMethods && <p className="text-xs text-[var(--muted)]">Loading methods...</p>}
                      
                      {myMethods.length > 0 ? (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {myMethods.map(m => (
                             <button
                               key={m.id}
                               type="button"
                               onClick={() => toggleMethod(m.id)}
                               className={`rounded-full px-3 py-1 text-xs border transition ${
                                 selectedMethods.includes(m.id)
                                   ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                                   : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--fg)]"
                               }`}
                             >
                               {m.name}
                             </button>
                          ))}
                        </div>
                      ) : (
                         <div className="text-xs text-[var(--muted)] p-2 border border-dashed border-[var(--border)] rounded">
                            No payment items found. Please add one.
                         </div>
                      )}

                      {!fetchingMethods && !showAddMethod && (
                        <button 
                          type="button" 
                          onClick={() => setShowAddMethod(true)}
                          className="text-xs text-[var(--accent)] underline mt-1 font-medium"
                        >
                          + Add New Payment Account
                        </button>
                      )}
                      
                      {showAddMethod && (
                          <AddMethodForm 
                             onCancel={() => setShowAddMethod(false)}
                             onSuccess={() => {
                               setShowAddMethod(false);
                               fetchMethods(); 
                             }}
                          />
                      )}
                   </div>
                ) : (
                   <div className="flex flex-wrap gap-2 mt-1">
                      {PAYMENT_METHODS.map((method) => (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => toggleMethod(method.id)}
                          className={`rounded-full px-3 py-1 text-xs border transition ${
                            selectedMethods.includes(method.id)
                              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                              : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--fg)]"
                          }`}
                        >
                          {method.name}
                        </button>
                      ))}
                   </div>
                )}
             </div>

             {/* Terms */}
             <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Terms & Conditions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. NO third party payments. Release after confirmation."
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
             </div>
             
          </div>

          <div className="mt-6 flex justify-end gap-3">
             <button
               type="button"
               onClick={onClose}
               className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--bg)] transition"
             >
               Cancel
             </button>
             <button
               type="submit"
               disabled={loading}
               className="rounded-lg bg-[var(--accent)] px-6 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
             >
               {loading ? "Posting..." : "Post Ad"}
             </button>
          </div>
        </form>

      </div>
    </div>
  );
}
