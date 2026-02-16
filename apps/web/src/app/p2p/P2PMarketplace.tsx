"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CreateAdModal } from "./CreateAdModal";
import { TakeAdModal } from "./TakeAdModal";
import { getPaymentMethodName } from "@/lib/p2p/constants";

// Types matching our API
type Ad = {
  id: string;
  side: "BUY" | "SELL";
  fiat_currency: string;
  price_type: "fixed" | "floating";
  fixed_price: string;
  margin_percent: string;
  remaining_amount: string;
  min_limit: string;
  max_limit: string;
  payment_window_minutes: number;
  // Seller's supported payment rails for this ad (e.g. ['mpesa','bank_transfer']).
  // Returned by the API via join against seller's saved methods.
  payment_methods?: string[];
  payment_method_ids?: string[];
  email: string;
  display_name?: string | null;
  terms: string | null;
};

import { ALL_CURRENCIES } from "@/lib/p2p/constants"; // Import constants

export function P2PMarketplace() {
  const params = useSearchParams();
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [asset, setAsset] = useState("USDT");
  const [fiat, setFiat] = useState("USD"); // Global default; user can switch
  const [amount, setAmount] = useState("");

  // Allow deep-linking (used by onboarding): /p2p?side=BUY&asset=USDT&fiat=KES&amount=1000
  const didInitFromQuery = useRef(false);
  useEffect(() => {
    if (didInitFromQuery.current) return;
    didInitFromQuery.current = true;

    const qSide = (params.get("side") ?? "").toUpperCase();
    const qAsset = (params.get("asset") ?? "").toUpperCase();
    const qFiat = (params.get("fiat") ?? "").toUpperCase();
    const qAmount = params.get("amount") ?? "";

    if (qSide === "BUY" || qSide === "SELL") setSide(qSide);
    if (qAsset) setAsset(qAsset);
    if (qFiat) setFiat(qFiat);
    if (qAmount) setAmount(qAmount);
  }, [params]);
  
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);

  useEffect(() => {
    async function fetchAds() {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          side,
          asset,
          fiat,
          ...(amount ? { amount } : {}),
        });
        
        const res = await fetch(`/api/p2p/ads?${query.toString()}`);
        if (!res.ok) {
          let code: string | undefined;
          try {
            const body = await res.json();
            code = body?.error;
          } catch {
            // ignore
          }
          throw new Error(code || `http_${res.status}`);
        }
        
        const data = await res.json();
        setAds(data.ads || []);
        setFetchError(null);
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : "fetch_failed";
        setFetchError(msg);
      } finally {
        setLoading(false);
      }
    }
    
    // Debounce slightly in real app
    const t = setTimeout(fetchAds, 100);
    return () => clearTimeout(t);
  }, [side, asset, fiat, amount, retryNonce]);

  return (
    <div className="space-y-6">
      {/* ── Filters ─────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {/* Top Bar with Navigation */}
        <div className="flex justify-between items-center pb-2 border-b border-[var(--border)] mb-2">
            <h2 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wide">Marketplace</h2>
            <Link href="/p2p/orders" className="text-sm font-medium text-[var(--accent)] hover:underline flex items-center gap-1">
               <span>My Orders</span>
               <span>→</span>
            </Link>
        </div>

      <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)] md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          {/* Buy / Sell Tabs */}
          <div className="flex rounded-lg bg-[var(--background)] p-1">
            <button
              onClick={() => setSide("BUY")}
              className={`rounded-md px-6 py-2 text-sm font-bold transition ${
                side === "BUY"
                  ? "bg-[var(--up)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setSide("SELL")}
              className={`rounded-md px-6 py-2 text-sm font-bold transition ${
                side === "SELL"
                  ? "bg-[var(--down)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Sell
            </button>
          </div>

          {/* Asset Select */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--muted)]">Crypto</label>
            <select 
              value={asset} 
              onChange={(e) => setAsset(e.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-medium outline-none focus:border-[var(--accent)]"
            >
              <option value="USDT">USDT</option>
              <option value="BNB">BNB</option>
            </select>
          </div>
          
          {/* Fiat Select */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--muted)]">Fiat</label>
            <select 
              value={fiat} 
              onChange={(e) => setFiat(e.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-medium outline-none focus:border-[var(--accent)]"
            >
              {ALL_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>

          {/* Amount Input */}
          <div className="flex flex-col gap-1.5">
             <label className="text-xs font-semibold text-[var(--muted)]">Amount</label>
             <input 
               type="number"
               placeholder="Enter amount"
               value={amount}
               onChange={(e) => setAmount(e.target.value)}
               className="h-10 w-32 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-medium outline-none focus:border-[var(--accent)]"
             />
          </div>
        </div>

        {/* Post Ad Button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-110"
        >
          + Post Ad
        </button>
      </div>
      </div>

      {showCreateModal && <CreateAdModal onClose={() => setShowCreateModal(false)} />}

      {/* ── Ads List ────────────────────────────────────── */}
      <div className="space-y-3">
        {fetchError && !loading && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[var(--foreground)]">Failed to load ads</div>
                <div className="mt-1 text-xs text-[var(--muted)]">Error: {fetchError}</div>
              </div>
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-110"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {loading ? (
          // Skeleton
          Array.from({ length: 3 }).map((_, i) => (
             <div key={i} className="h-24 w-full animate-pulse rounded-xl border border-[var(--border)] bg-[var(--card)]" />
          ))
        ) : ads.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)]">
            <p>No ads found matching your criteria.</p>
            <div className="mt-2 text-xs">Try changing the asset or currency.</div>
          </div>
        ) : (
          ads.map((ad) => (
             <AdCard 
               key={ad.id} 
               ad={ad} 
               mySide={side} 
               asset={asset} 
               onTake={() => setSelectedAd(ad)}
             />
          ))
        )}
      </div>

      {selectedAd && (
        <TakeAdModal 
          ad={{
            id: selectedAd.id,
            side: selectedAd.side,
            price: selectedAd.fixed_price,
            asset: asset,
            fiat: selectedAd.fiat_currency,
            min: selectedAd.min_limit,
            max: selectedAd.max_limit,
            payment_window: selectedAd.payment_window_minutes
          }} 
          onClose={() => setSelectedAd(null)} 
        />
      )}
    </div>
  );
}

function AdCard({ ad, mySide, asset, onTake }: { ad: Ad, mySide: "BUY" | "SELL", asset: string, onTake: () => void }) {
  // Use display_name if available, else anonymize email
  let displayName = "user";
  if (ad.display_name) {
    displayName = ad.display_name;
  } else if (ad.email) {
    const parts = ad.email.split("@");
    displayName = parts.length > 1 
      ? parts[0].slice(0, 3) + "***"
      : ad.email.slice(0, 5) + "***";
  }

  // Format price
  const price = Number(ad.fixed_price).toLocaleString();
  
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)] hover:shadow-md md:flex-row md:items-center">
      {/* User Info */}
      <div className="w-full md:w-48">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--card-2)] text-xs font-bold text-[var(--muted)]">
            {displayName[0].toUpperCase()}
          </div>
          <div className="text-sm font-semibold text-[var(--foreground)]">{displayName}</div>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--muted)]">
          <span className="text-[var(--up)]">Online</span>
          <span>•</span>
          <span>{ad.payment_window_minutes} min</span>
        </div>
      </div>

      {/* Price & Limits */}
      <div className="flex-1 space-y-1">
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-[var(--foreground)]">{price}</span>
          <span className="text-xs font-medium text-[var(--muted)]">{ad.fiat_currency}</span>
        </div>
        <div className="flex flex-col gap-0.5 text-xs text-[var(--muted)] md:flex-row md:gap-4">
          <div>Available: <span className="font-medium text-[var(--foreground)]">{Number(ad.remaining_amount).toLocaleString()} {asset}</span></div>
          <div className="hidden md:block">•</div>
          <div>Limit: <span className="font-medium text-[var(--foreground)]">{Number(ad.min_limit).toLocaleString()} - {Number(ad.max_limit).toLocaleString()} {ad.fiat_currency}</span></div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="w-full md:w-40">
        <div className="flex flex-wrap gap-1">
          {(Array.isArray(ad.payment_methods) ? ad.payment_methods : []).map((identifier) => (
            <span
              key={identifier}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium border border-[var(--border)]"
            >
              {getPaymentMethodName(identifier)}
            </span>
          ))}
          {(!ad.payment_methods || (Array.isArray(ad.payment_methods) && ad.payment_methods.length === 0)) && (
            <span className="text-[10px] text-[var(--muted)]">Bank Transfer</span>
          )}
        </div>
      </div>

      {/* Action */}
      <div className="w-full md:w-auto">
        <button 
          onClick={onTake}
          className={`h-9 w-full rounded-lg px-6 text-sm font-bold text-white transition hover:brightness-110 md:w-auto ${
            mySide === "BUY" ? "bg-[var(--up)]" : "bg-[var(--down)]"
          }`}
        >
          {mySide === "BUY" ? `Buy ${asset}` : `Sell ${asset}`}
        </button>
      </div>

      {/* Action */}
      <div>
        <Link 
          href={`/p2p/order/create?ad_id=${ad.id}`}
          className={`block w-full rounded-lg px-6 py-2 text-center text-sm font-bold text-white transition hover:brightness-110 md:w-auto ${
             mySide === "BUY" ? "bg-[var(--up)]" : "bg-[var(--down)]"
          }`}
        >
          {mySide} {asset}
        </Link>
      </div>
    </div>
  );
}
