import { ArcadeTransparencyClient } from "@/app/arcade/transparency/transparencyClient";

export const dynamic = "force-dynamic";

export default function ArcadeTransparencyPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Arcade</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Transparency</h1>
        <p className="text-sm text-[var(--v2-muted)]">Proofs and fairness signals.</p>
      </header>

      <ArcadeTransparencyClient />
    </main>
  );
}
