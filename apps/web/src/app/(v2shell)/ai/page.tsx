import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { AiAdvisorClient } from "@/app/ai/AiAdvisorClient";

export const dynamic = "force-dynamic";

export default function AiPage() {
  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Security</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Security Center</h1>
        <p className="text-sm text-[var(--v2-muted)]">Learn scam patterns and how to stay safe.</p>
      </header>

      <V2Card>
        <V2CardHeader title="Guidance" subtitle="Education-only, not financial advice." />
        <V2CardBody>
          <AiAdvisorClient />
        </V2CardBody>
      </V2Card>
    </main>
  );
}
