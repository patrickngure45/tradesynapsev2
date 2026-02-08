import { SiteChrome } from "@/components/SiteChrome";
import { CopyTradingClient } from "./CopyTradingClient";

export const metadata = { title: "Copy Trading — TradeSynapse" };

export default function CopyTradingPage() {
  return (
    <SiteChrome>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Copy Trading</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Follow top traders and automatically mirror their trades
          </p>
        </div>
        <CopyTradingClient />
      </div>
    </SiteChrome>
  );
}
