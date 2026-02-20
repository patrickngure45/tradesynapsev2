import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { AdminDashboardClient } from "./AdminDashboardClient";
import { BRAND_NAME } from "@/lib/seo/brand";

export const metadata: Metadata = { title: `Admin · ${BRAND_NAME}` };
export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
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
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3">
                  <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                    <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
                  </span>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Operations</div>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                </div>

                <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--foreground)] md:text-4xl">
                  <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] bg-clip-text text-transparent">Admin</span>{" "}
                  <span>Dashboard</span>
                </h1>

                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--muted)]">
                  Wallet overview · Withdrawal review · Ledger reconciliation · Outbox dead-letters
                </p>
              </div>
            </div>
          </div>
        </section>

        <AdminDashboardClient />
      </main>
    </SiteChrome>
  );
}
