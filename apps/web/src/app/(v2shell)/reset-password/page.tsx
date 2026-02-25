import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { ResetPasswordClient } from "@/app/reset-password/ResetPasswordClient";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Account</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Reset password</h1>
        <p className="text-sm text-[var(--v2-muted)]">Set a new password.</p>
      </header>

      <V2Card>
        <V2CardHeader title="Confirm" subtitle="Choose a strong password." />
        <V2CardBody>
          <ResetPasswordClient />
        </V2CardBody>
      </V2Card>
    </main>
  );
}
