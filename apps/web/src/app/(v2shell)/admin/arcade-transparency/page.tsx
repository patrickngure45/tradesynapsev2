import { AdminArcadeTransparencyClient } from "@/app/admin/arcade-transparency/transparencyClient";

export const dynamic = "force-dynamic";

export default function AdminArcadeTransparencyPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Operations</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Arcade transparency</h1>
        <p className="text-sm text-[var(--v2-muted)]">Admin tools for fairness proofs.</p>
      </header>

      <AdminArcadeTransparencyClient />
    </main>
  );
}
