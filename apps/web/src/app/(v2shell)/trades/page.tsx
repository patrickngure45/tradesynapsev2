import { TradesClient } from "@/app/trades/TradesClient";

export const dynamic = "force-dynamic";

export default function TradesPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">History</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Trades</h1>
        <p className="text-sm text-[var(--v2-muted)]">Your activity across flows.</p>
      </header>

      <TradesClient initialTrades={[]} />
    </main>
  );
}
