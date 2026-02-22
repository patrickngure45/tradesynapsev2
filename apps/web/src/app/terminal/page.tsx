import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "@/components/SiteChrome";
import { buttonClassName } from "@/components/ui/Button";
import { TerminalClient } from "./terminalClient";

export const metadata: Metadata = { title: "Terminal" };
export const dynamic = "force-dynamic";

export default function TerminalPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
        <section className="relative mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
            style={{
              background:
                "radial-gradient(760px 280px at 20% 0%, color-mix(in oklab, var(--accent) 16%, transparent) 0%, transparent 60%), radial-gradient(520px 240px at 90% 10%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 55%)",
            }}
          />

          <div className="relative p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                    <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
                  </span>
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Terminal</div>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                </div>

                <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">Spot trading</h1>
                <p className="mt-2 text-sm text-[var(--muted)]">Order book, tape, and execution — with fast, predictable flows.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link href="/home" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                  Dashboard
                </Link>
                <Link href="/order-history" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                  Orders
                </Link>
                <Link href="/wallet" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                  Wallet
                </Link>
              </div>
            </div>
          </div>
        </section>

        <TerminalClient />
      </main>
    </SiteChrome>
  );
}
