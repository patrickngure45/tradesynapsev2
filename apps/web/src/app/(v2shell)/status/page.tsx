import { StatusClient } from "@/app/status/StatusClient";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";

export const dynamic = "force-dynamic";

export default function StatusPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">System</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Status</h1>
        <p className="text-sm text-[var(--v2-muted)]">Platform health and service signals.</p>
      </header>

      <V2Card>
        <V2CardHeader title="Health" subtitle="API and database reachability" />
        <V2CardBody>
          <StatusClient />
        </V2CardBody>
      </V2Card>
    </main>
  );
}
