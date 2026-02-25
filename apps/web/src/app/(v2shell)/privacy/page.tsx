import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Legal</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Privacy</h1>
        <p className="text-sm text-[var(--v2-muted)]">Draft copy for early testing. Replace with reviewed legal copy before production.</p>
      </header>

      <div className="grid gap-3">
        <V2Card>
          <V2CardHeader title="What we collect" />
          <V2CardBody>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-[var(--v2-muted)]">
              <li>Account data: email, password hash, display name (optional), country/region.</li>
              <li>Security data: 2FA enabled status and verification events.</li>
              <li>Trading data: orders, balances, withdrawals, and activity logs.</li>
              <li>P2P data: ads, orders, and chat metadata necessary to complete transactions.</li>
            </ul>
          </V2CardBody>
        </V2Card>

        <V2Card>
          <V2CardHeader title="How we use it" />
          <V2CardBody>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-[var(--v2-muted)]">
              <li>Provide and secure the service (auth, fraud/risk checks, audit logs).</li>
              <li>Process deposits and withdrawals and show transaction history.</li>
              <li>Send critical notifications (security and transaction events).</li>
            </ul>
          </V2CardBody>
        </V2Card>

        <V2Card>
          <V2CardHeader title="Sharing" />
          <V2CardBody>
            <p className="text-[13px] text-[var(--v2-muted)]">
              We only share data with service providers needed to run the platform (for example, email delivery) and where required for safety, compliance, or to respond to lawful requests.
            </p>
          </V2CardBody>
        </V2Card>

        <V2Card>
          <V2CardHeader title="Your controls" />
          <V2CardBody>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-[var(--v2-muted)]">
              <li>You can update some account settings in Account.</li>
              <li>You can enable 2FA (recommended) to protect your funds.</li>
            </ul>
          </V2CardBody>
        </V2Card>
      </div>
    </main>
  );
}
