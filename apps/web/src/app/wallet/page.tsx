import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteChrome } from "@/components/SiteChrome";
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
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            View your internal balances and manage transfers, holds, allowlists, and withdrawals.
          </p>
        </header>

        <div className="mt-6">
          <ExchangeWalletClient isAdmin={isAdmin} />
        </div>
      </main>
    </SiteChrome>
  );
}
