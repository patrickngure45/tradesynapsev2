import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trades" };
export const dynamic = "force-dynamic";

import { SiteChrome } from "@/components/SiteChrome";

import { TradesClient } from "./TradesClient";
export default function TradesPage() {
  return (
    <SiteChrome>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Trades</h1>
        </div>

        <TradesClient initialTrades={[]} />
      </main>
    </SiteChrome>
  );
}
