import { AdminMarketsClient } from "@/app/admin/markets/marketsClient";

export const dynamic = "force-dynamic";

export default function AdminMarketsPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Operations</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Markets</h1>
        <p className="text-sm text-[var(--v2-muted)]">Market status and controls.</p>
      </header>

      <AdminMarketsClient />
    </main>
  );
}
