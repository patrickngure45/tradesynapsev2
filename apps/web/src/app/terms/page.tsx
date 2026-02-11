import type { Metadata } from "next";

import { SiteChrome } from "@/components/SiteChrome";

export const metadata: Metadata = { title: "Terms" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Terms</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            These Terms are a plain-language draft for early testing. Replace with reviewed legal terms before production.
          </p>
        </header>

        <div className="space-y-6 text-sm text-[var(--foreground)]">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">1) Risk disclosure</h2>
            <p className="mt-2 text-[var(--muted)]">
              Crypto assets are volatile. Prices can move quickly and you can lose money. Do not trade with funds you cannot
              afford to lose.
            </p>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">2) Account security</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
              <li>Keep your password private and use a unique password.</li>
              <li>Enable 2FA (TOTP) before withdrawals.</li>
              <li>Be careful with phishing links and unknown support contacts.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">3) P2P trading</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
              <li>Only mark "Paid" after you actually send the payment.</li>
              <li>Use the in-app chat and follow escrow instructions.</li>
              <li>Payments can be reversed or disputed depending on the payment rail.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">4) Service availability</h2>
            <p className="mt-2 text-[var(--muted)]">
              Features may change during development. Market data may be delayed or unavailable due to network, provider,
              or exchange limitations.
            </p>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">5) Contact</h2>
            <p className="mt-2 text-[var(--muted)]">
              If something looks wrong (unexpected login prompts, withdrawal issues, suspicious counterparties), contact
              support through the official channels listed in the app.
            </p>
          </section>
        </div>
      </main>
    </SiteChrome>
  );
}
