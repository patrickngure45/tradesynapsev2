import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SiteChrome } from "@/components/SiteChrome";
import { AuthClient } from "./AuthClient";

export const metadata: Metadata = { title: "Log In" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="mb-8 flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to TradeSynapse</h1>
          <p className="text-sm text-[var(--muted)]">
            Sign in to start trading on BSC
          </p>
        </header>

        <Suspense>
          <AuthClient />
        </Suspense>

        <div className="mt-8 text-center text-xs text-[var(--muted)]">
          After signing in: <Link className="underline" href="/markets">Markets</Link> → <Link className="underline" href="/exchange">Spot Trading</Link>
        </div>
      </main>
    </SiteChrome>
  );
}
