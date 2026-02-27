export const dynamic = "force-dynamic";

export default function FeesPage() {
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Support</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Fee Structure</h1>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-extrabold tracking-tight">Spot Trading Fees</h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] shadow-[var(--v2-shadow-sm)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--v2-surface-2)] text-left">
              <tr>
                <th className="p-3 font-semibold text-[var(--v2-muted)]">Tier</th>
                <th className="p-3 font-semibold text-[var(--v2-muted)]">30d Volume</th>
                <th className="p-3 font-semibold text-[var(--v2-muted)]">Maker Fee</th>
                <th className="p-3 font-semibold text-[var(--v2-muted)]">Taker Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--v2-border)]">
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
        <p className="text-xs text-[var(--v2-muted)]">Fees are deducted from the received asset.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-extrabold tracking-tight">P2P Fees</h2>
        <div className="grid gap-3">
          <div className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4 shadow-[var(--v2-shadow-sm)]">
            <h3 className="font-semibold">Maker (Advertiser)</h3>
            <div className="mt-1 text-[13px] text-[var(--v2-muted)]">0% (draft)</div>
          </div>
          <div className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4 shadow-[var(--v2-shadow-sm)]">
            <h3 className="font-semibold">Taker</h3>
            <div className="mt-1 text-[13px] text-[var(--v2-muted)]">0% (draft)</div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold tracking-tight">Withdrawal Fees</h2>
        <p className="text-sm text-[var(--v2-muted)]">Dynamic based on network conditions (draft examples):</p>
        <ul className="list-disc pl-5 text-sm space-y-1 text-[var(--v2-muted)]">
          <li><strong>BTC:</strong> ~0.0002 BTC</li>
          <li><strong>ETH:</strong> ~0.002 ETH</li>
          <li><strong>USDT (BSC):</strong> 0.29 USDT</li>
        </ul>
      </section>
    </main>
  );
}
