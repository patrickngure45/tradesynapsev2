import { SiteChrome } from "@/components/SiteChrome";

export const metadata = { title: "Fees Structure — TradeSynapse" };

export default function FeesPage() {
  return (
    <SiteChrome>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold mb-6">Fee Structure</h1>
        
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold border-b border-[var(--border)] pb-2">Spot Trading Fees</h2>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--card-2)] text-left">
                  <tr>
                    <th className="p-3 font-medium text-[var(--muted)]">Tier</th>
                    <th className="p-3 font-medium text-[var(--muted)]">30d Volume</th>
                    <th className="p-3 font-medium text-[var(--muted)]">Maker Fee</th>
                    <th className="p-3 font-medium text-[var(--muted)]">Taker Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  <tr>
                    <td className="p-3">VIP 0</td>
                    <td className="p-3">&lt; $50k</td>
                    <td className="p-3">0.1000%</td>
                    <td className="p-3">0.1000%</td>
                  </tr>
                  <tr>
                    <td className="p-3">VIP 1</td>
                    <td className="p-3">≥ $50k</td>
                    <td className="p-3">0.0900%</td>
                    <td className="p-3">0.1000%</td>
                  </tr>
                  <tr>
                    <td className="p-3">VIP 2</td>
                    <td className="p-3">≥ $500k</td>
                    <td className="p-3">0.0800%</td>
                    <td className="p-3">0.1000%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Fees are deducted from the received asset.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold border-b border-[var(--border)] pb-2">P2P Fees</h2>
            <div className="grid gap-4 md:grid-cols-2">
               <div className="rounded-lg border border-[var(--border)] p-4">
                 <h3 className="font-medium mb-1">Maker (Advertiser)</h3>
                 <div className="text-2xl font-bold text-[var(--accent)]">0%</div>
                 <p className="text-xs text-[var(--muted)] mt-1">Zero fees for posting ads on the P2P marketplace.</p>
               </div>
               <div className="rounded-lg border border-[var(--border)] p-4">
                 <h3 className="font-medium mb-1">Taker</h3>
                 <div className="text-2xl font-bold text-[var(--accent)]">0%</div>
                  <p className="text-xs text-[var(--muted)] mt-1">Zero fees for taking existing orders.</p>
               </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold border-b border-[var(--border)] pb-2">Withdrawal Fees</h2>
            <p className="text-sm text-[var(--background)-foreground]">
              Withdrawal fees enable us to process transactions on the blockchain. They are dynamic based on network conditions.
            </p>
            <ul className="list-disc pl-5 text-sm space-y-1 text-[var(--muted)]">
              <li><strong>BTC:</strong> ~0.0002 BTC</li>
              <li><strong>ETH:</strong> ~0.002 ETH</li>
              <li><strong>USDT (BSC):</strong> 0.29 USDT</li>
            </ul>
          </section>
        </div>
      </div>
    </SiteChrome>
  );
}
