import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { SiteChrome } from "@/components/SiteChrome";
import { buttonClassName } from "@/components/ui/Button";
import { getSql } from "@/lib/db";
import { verifySessionToken, getSessionCookieName } from "@/lib/auth/session";

import { ExchangeWalletClient } from "../exchange/ExchangeWalletClient";

export const metadata: Metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  let isAdmin = false;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName())?.value;
    if (token && process.env.PROOFPACK_SESSION_SECRET) {
      const verified = verifySessionToken({ token, secret: process.env.PROOFPACK_SESSION_SECRET });
      if (verified.ok) {
        const sql = getSql();
        const rows = await sql`SELECT role FROM app_user WHERE id = ${verified.payload.uid} LIMIT 1`;
        if (rows.length > 0 && rows[0].role === "admin") {
          isAdmin = true;
        }
      }
    }
  } catch {
    // ignore
  }

  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
        <section className="relative mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
            style={{
              background:
                "radial-gradient(700px 260px at 20% 0%, color-mix(in oklab, var(--accent) 18%, transparent) 0%, transparent 60%), radial-gradient(440px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 12%, transparent) 0%, transparent 55%)",
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
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Wallet</div>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                </div>

                <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">Balances & rails</h1>
                <p className="mt-2 text-sm text-[var(--muted)]">Deposit, move funds, convert, and review holds — with clear state.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link href="/home" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                  Dashboard
                </Link>
                <Link href="/wallet/withdraw" className={buttonClassName({ variant: "primary", size: "sm" })}>
                  Withdraw
                </Link>
                <Link href="/status" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                  Status
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="fade-in-up">
          <ExchangeWalletClient isAdmin={isAdmin} />
        </div>
      </main>
    </SiteChrome>
  );
}
