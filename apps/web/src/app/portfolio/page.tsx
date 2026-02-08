import { SiteChrome } from "@/components/SiteChrome";
import { PortfolioClient } from "./PortfolioClient";

export const metadata = { title: "Portfolio — TradeSynapse" };

export default function PortfolioPage() {
  return (
    <SiteChrome>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Balances, PnL, and trade history
          </p>
        </div>
        <PortfolioClient />
      </div>
    </SiteChrome>
  );
}
