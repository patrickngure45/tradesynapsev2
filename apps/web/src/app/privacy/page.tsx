import type { Metadata } from "next";

import { SiteChrome } from "@/components/SiteChrome";

export const metadata: Metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Privacy</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This Privacy notice is a plain-language draft for early testing. Replace with reviewed legal copy before production.
          </p>
        </header>

        <div className="space-y-6 text-sm text-[var(--foreground)]">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">What we collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
              <li>Account data: email, password hash, display name (optional), country/region.</li>
              <li>Security data: 2FA enabled status and verification events.</li>
              <li>Trading data: orders, balances, withdrawals, and activity logs.</li>
              <li>P2P data: ads, orders, and chat metadata necessary to complete transactions.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">How we use it</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
              <li>Provide and secure the service (auth, fraud/risk checks, audit logs).</li>
              <li>Process deposits and withdrawals and show transaction history.</li>
              <li>Send critical notifications (security and transaction events).</li>
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">Sharing</h2>
            <p className="mt-2 text-[var(--muted)]">
              We only share data with service providers needed to run the platform (for example, email delivery) and where
              required for safety, compliance, or to respond to lawful requests.
            </p>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">Your controls</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
              <li>You can update some account settings in Account.</li>
              <li>You can enable 2FA (recommended) to protect your funds.</li>
            </ul>
          </section>
        </div>
      </main>
    </SiteChrome>
  );
}
