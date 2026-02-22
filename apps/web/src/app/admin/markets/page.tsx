import type { Metadata } from "next";
import Link from "next/link";

import { SiteChrome } from "@/components/SiteChrome";
import { BRAND_NAME } from "@/lib/seo/brand";
import { AdminMarketsClient } from "@/app/admin/markets/marketsClient";

export const metadata: Metadata = {
  title: `Admin Markets | ${BRAND_NAME}`,
  description: "Enable/disable markets (halt new orders, allow cancels).",
};

export const dynamic = "force-dynamic";

export default function AdminMarketsPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-4 text-xs text-[var(--muted)]">
          <Link href="/admin" className="hover:underline">
            ← Back to Admin
          </Link>
        </div>

        <section className="relative mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
            style={{
              backgroundImage:
                "radial-gradient(circle at 18% 20%, var(--ring) 0, transparent 55%), radial-gradient(circle at 86% 72%, var(--ring) 0, transparent 55%)",
            }}
          />

          <div className="relative p-6 md:p-8">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
                <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
              </span>
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Markets</div>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--foreground)] md:text-4xl">
              Market <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] bg-clip-text text-transparent">Kill Switch</span>
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--muted)]">
              Disabling a market halts new orders while leaving cancels available.
            </p>
          </div>
        </section>

        <AdminMarketsClient />
      </main>
    </SiteChrome>
  );
}
