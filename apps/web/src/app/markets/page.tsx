import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";

import { MarketsClient } from "./MarketsClient";

export const metadata: Metadata = { title: "Markets" };
export const dynamic = "force-dynamic";

export default function MarketsPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
          <p className="text-sm text-[var(--muted)]">
            Spot-only for now. Derivatives, margin, and advanced order types are planned.
          </p>
        </header>

        <div className="mt-6">
          <MarketsClient />
        </div>
      </main>
    </SiteChrome>
  );
}
