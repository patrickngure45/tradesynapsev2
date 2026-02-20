import type { Metadata } from "next";

import { SiteChrome } from "@/components/SiteChrome";
import { ExpressClient } from "./ExpressClient";
import { BRAND_NAME } from "@/lib/seo/brand";

export const metadata: Metadata = {
  title: `Express | ${BRAND_NAME}`,
  description: "Net outcome router: P2P USDT + best spot price estimate.",
};

export const dynamic = "force-dynamic";

export default function ExpressPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Express</h1>
          <p className="text-sm text-[var(--muted)]">
            Net-first router. Quotes include estimated fees/slippage and the best available fixed-price P2P USDT ad.
          </p>
        </header>

        <div className="mt-6">
          <ExpressClient />
        </div>
      </main>
    </SiteChrome>
  );
}
