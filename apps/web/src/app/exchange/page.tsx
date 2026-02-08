import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { SiteChrome } from "@/components/SiteChrome";
import { getSql } from "@/lib/db";
import { verifySessionToken, getSessionCookieName } from "@/lib/auth/session";

import { ExchangeWalletClient } from "./ExchangeWalletClient";
import { ExchangeTradingClient } from "./ExchangeTradingClient";

export const metadata: Metadata = { title: "Exchange" };

export default async function ExchangePage({
  searchParams,
}: {
  searchParams?: Promise<{ market_id?: string | string[] }>;
}) {
  const sp = await Promise.resolve(searchParams);
  const qp = sp?.market_id;
  const initialMarketId = Array.isArray(qp) ? qp[0] : qp;

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
  } catch (err) {
    // ignore
  }

  return (
    <SiteChrome>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-2">
          <div className="text-xs text-zinc-500">
            <Link className="underline" href="/">
              ← Home
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Spot</h1>
          <p className="text-[var(--muted)]">
            Terminal-style spot trading UI backed by the deterministic exchange + ledger.
          </p>
        </header>

        <ExchangeTradingClient initialMarketId={initialMarketId} />
      </main>
    </SiteChrome>
  );
}
