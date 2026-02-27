import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Legal</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Terms</h1>
        <p className="text-sm text-[var(--v2-muted)]">Draft copy for early testing. Replace with reviewed legal terms before production.</p>
      </header>

      <div className="grid gap-3">
        <V2Card>
          <V2CardHeader title="1) Risk disclosure" />
          <V2CardBody>
            <p className="text-[13px] text-[var(--v2-muted)]">
              Crypto assets are volatile. Prices can move quickly and you can lose money. Do not trade with funds you cannot afford to lose.
            </p>
          </V2CardBody>
        </V2Card>

        <V2Card>
          <V2CardHeader title="2) Account security" />
          <V2CardBody>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-[var(--v2-muted)]">
              <li>Keep your password private and use a unique password.</li>
              <li>Enable 2FA (TOTP) before withdrawals.</li>
              <li>Be careful with phishing links and unknown support contacts.</li>
            </ul>
          </V2CardBody>
        </V2Card>

        <V2Card>
          <V2CardHeader title="3) P2P trading" />
          <V2CardBody>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-[var(--v2-muted)]">
              <li>Only mark "Paid" after you actually send the payment.</li>
              <li>Use the in-app chat and follow escrow instructions.</li>
              <li>Payments can be reversed or disputed depending on the payment rail.</li>
            </ul>
          </V2CardBody>
        </V2Card>

        <V2Card>
          <V2CardHeader title="4) Service availability" />
          <V2CardBody>
            <p className="text-[13px] text-[var(--v2-muted)]">
              Features may change during development. Market data may be delayed or unavailable due to network, provider, or exchange limitations.
            </p>
          </V2CardBody>
        </V2Card>

        <V2Card>
          <V2CardHeader title="5) Contact" />
          <V2CardBody>
            <p className="text-[13px] text-[var(--v2-muted)]">
              If something looks wrong (unexpected login prompts, withdrawal issues, suspicious counterparties), contact support through the official channels listed in the app.
            </p>
          </V2CardBody>
        </V2Card>
      </div>
    </main>
  );
}
