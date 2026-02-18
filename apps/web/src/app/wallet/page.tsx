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
      <main className="mx-auto flex w-full max-w-6xl flex-col px-6 py-10 sm:py-14">
        <div className="fade-in-up">
          <ExchangeWalletClient isAdmin={isAdmin} />
        </div>
      </main>
    </SiteChrome>
  );
}
