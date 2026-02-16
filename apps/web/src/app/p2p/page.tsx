import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { P2PMarketplace } from "./P2PMarketplace";
import { SUPPORTED_P2P_COUNTRIES } from "@/lib/p2p/supportedCountries";

export const metadata: Metadata = {
  title: "P2P Trading | TradeSynapse",
  description: "Buy and sell crypto directly with other users. Secure escrow. Zero fees.",
};

export default function P2PPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">P2P Trading</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Buy and sell crypto directly with other users via M-Pesa, Airtel Money, and Bank Transfer.
            Funds are held in secure escrow until the payments are confirmed.
          </p>
        </header>

        {/* Onboarding / How it works */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-bold mb-4 text-[var(--foreground)]">How P2P Trading Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
             <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold">1</div>
                <div>
                   <h3 className="font-bold text-[var(--foreground)]">Place an Order</h3>
                   <p className="text-[var(--muted)] mt-1">Select an ad with your preferred price and payment method (e.g. M-Pesa).</p>
                </div>
             </div>
             <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold">2</div>
                <div>
                   <h3 className="font-bold text-[var(--foreground)]">Pay the Seller</h3>
                   <p className="text-[var(--muted)] mt-1">Send money directly to their account. Mark the order as paid only after sending.</p>
                </div>
             </div>
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold">3</div>
                <div>
                   <h3 className="font-bold text-[var(--foreground)]">Receive Crypto</h3>
                   <p className="text-[var(--muted)] mt-1">Once the seller releases the crypto, it is instantly added to your wallet.</p>
                </div>
             </div>
          </div>
        </div>

        {/* Supported countries */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-bold mb-4 text-[var(--foreground)]">Supported Countries</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            {Object.entries(SUPPORTED_P2P_COUNTRIES).map(([region, countries]) => (
              <div key={region}>
                <h3 className="font-bold text-[var(--foreground)]">{region}</h3>
                <ul className="mt-2 space-y-1 text-[var(--muted)]">
                  {countries.map((c) => (
                    <li key={c}>- {c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <Suspense fallback={<div className="py-20 text-center text-[var(--muted)]">Loading P2P Market...</div>}>
          <P2PMarketplace />
        </Suspense>
      </main>
    </SiteChrome>
  );
}
