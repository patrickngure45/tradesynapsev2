import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { VerifyEmailClient } from "@/app/verify-email/VerifyEmailClient";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Account</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Verify email</h1>
        <p className="text-sm text-[var(--v2-muted)]">Confirm your email to unlock full features.</p>
      </header>

      <V2Card>
        <V2CardHeader title="Verification" subtitle="Follow the link you received." />
        <V2CardBody>
          <VerifyEmailClient />
        </V2CardBody>
      </V2Card>
    </main>
  );
}
