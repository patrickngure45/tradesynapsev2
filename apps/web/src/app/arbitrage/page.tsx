import { cookies } from "next/headers";
import { SiteChrome } from "@/components/SiteChrome";
import { BRAND_NAME } from "@/lib/seo/brand";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";
import { ArbitrageClient } from "./ArbitrageClient";
import { AIArbitrageAnalyst } from "./AIArbitrageAnalyst";
import { FundingDashboard } from "./FundingDashboard";
import { MarketRegimeWidget } from "./MarketRegimeWidget";

export const metadata = { title: `Arbitrage Scanner — ${BRAND_NAME}` };

export default async function ArbitragePage() {
  let userId: string | null = null;
  try {
    const cookieStore = await cookies();
    const name = getSessionCookieName();
    const token = cookieStore.get(name)?.value ?? "";
    const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
    if (token && secret) {
      const verified = verifySessionToken({ token, secret });
      // @ts-ignore
      if (verified.ok) userId = verified.payload.uid;
    }
  } catch { /* no session */ }

  return (
    <SiteChrome>
      <div className="mx-auto max-w-5xl space-y-12 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Arbitrage & Yield Scanner</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            USDT-based sizing · Cross-exchange price comparison · Cash & Carry opportunities
          </p>
        </div>
        
        {/* Market Intelligence (Regime) */}
        <div className="grid gap-4 md:grid-cols-2">
          <MarketRegimeWidget symbol="BTC/USDT" exchange="internal" />
          <MarketRegimeWidget symbol="ETH/USDT" exchange="internal" />
        </div>

        {/* AI Section (Conversational) */}
        <AIArbitrageAnalyst />

        {/* 1. Cash & Carry (Safe Yield) */}
        <section>
          <FundingDashboard />
        </section>

        {/* 2. Spot Arbitrage (Active) */}
        <section>
          <div className="mb-4">
             <h2 className="text-lg font-bold">Spot Arbitrage</h2>
             <p className="text-xs text-[var(--muted)]">Direct price differences between exchanges.</p>
          </div>
          <ArbitrageClient userId={userId} />
        </section>
      </div>
    </SiteChrome>
  );
}
