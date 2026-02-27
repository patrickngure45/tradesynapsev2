import { TradeDetailClient } from "@/app/trades/[id]/TradeDetailClient";

export const dynamic = "force-dynamic";

export default function TradeDetailsPage({ params }: { params: { id: string } }) {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">History</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Trade</h1>
        <p className="text-sm text-[var(--v2-muted)]">Details, status, and evidence.</p>
      </header>

      <TradeDetailClient tradeId={params.id} />
    </main>
  );
}
