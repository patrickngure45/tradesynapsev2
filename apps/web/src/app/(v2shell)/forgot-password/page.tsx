import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { ForgotPasswordClient } from "@/app/forgot-password/ForgotPasswordClient";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Account</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Forgot password</h1>
        <p className="text-sm text-[var(--v2-muted)]">Request a reset link.</p>
      </header>

      <V2Card>
        <V2CardHeader title="Reset" subtitle="We’ll email you a link." />
        <V2CardBody>
          <ForgotPasswordClient />
        </V2CardBody>
      </V2Card>
    </main>
  );
}
