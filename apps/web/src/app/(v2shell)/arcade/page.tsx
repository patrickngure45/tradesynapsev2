import { ArcadeClient } from "@/app/arcade/ArcadeClient";

export const dynamic = "force-dynamic";

export default function ArcadePage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Arcade</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Arcade</h1>
        <p className="text-sm text-[var(--v2-muted)]">Daily drops, reveals, and progression.</p>
      </header>

      <ArcadeClient />
    </main>
  );
}
