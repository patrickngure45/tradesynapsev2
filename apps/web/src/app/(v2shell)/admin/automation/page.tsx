import Link from "next/link";

import { v2ButtonClassName } from "@/components/v2/Button";
import { AutomationOpsAdminClient } from "@/app/admin/automation/AutomationOpsAdminClient";

export const dynamic = "force-dynamic";

export default function AdminAutomationPage() {
  return (
    <main className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Operations</div>
          <h1 className="text-2xl font-extrabold tracking-tight">Automation Ops</h1>
          <p className="text-sm text-[var(--v2-muted)]">Monitor and manually run cron/worker tasks.</p>
        </div>
        <Link href="/admin" className={v2ButtonClassName({ variant: "secondary", size: "sm" })}>
          Back to Admin
        </Link>
      </header>

      <AutomationOpsAdminClient />
    </main>
  );
}
