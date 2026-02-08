import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";

import { ExchangeWalletClient } from "../exchange/ExchangeWalletClient";
import { OnChainWalletPanel } from "@/components/OnChainWalletPanel";

export const metadata: Metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            On‑chain deposits, custodial ledger balances, holds, allowlists, and withdrawals.
          </p>
        </header>

        <div className="mt-6">
          <OnChainWalletPanel />
        </div>

        <div className="mt-6">
          <ExchangeWalletClient />
        </div>
      </main>
    </SiteChrome>
  );
}
