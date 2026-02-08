import { cookies } from "next/headers";
import { SiteChrome } from "@/components/SiteChrome";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";
import { ArbitrageClient } from "./ArbitrageClient";
import { AIArbitrageAnalyst } from "./AIArbitrageAnalyst";

export const metadata = { title: "Arbitrage Scanner — TradeSynapse" };

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
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Arbitrage Scanner</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Cross-exchange price comparison · Spot spread opportunities
          </p>
        </div>
        
        {/* AI Section */}
        <AIArbitrageAnalyst />

        {/* Traditional Scanner */}
        <ArbitrageClient userId={userId} />
      </div>
    </SiteChrome>
  );
}
