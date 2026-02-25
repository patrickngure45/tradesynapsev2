import { AdminDashboardClient } from "@/app/admin/AdminDashboardClient";
import Link from "next/link";
import { v2ButtonClassName } from "@/components/v2/Button";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Operations</div>
          <h1 className="text-2xl font-extrabold tracking-tight">Admin</h1>
          <p className="text-sm text-[var(--v2-muted)]">Wallet overview · Withdrawals · Reconciliation · Outbox</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/earn-products" className={v2ButtonClassName({ variant: "secondary", size: "sm" })}>
            Earn Products
          </Link>
          <Link href="/admin/automation" className={v2ButtonClassName({ variant: "secondary", size: "sm" })}>
            Automation Ops
          </Link>
        </div>
      </header>

      <AdminDashboardClient />
    </main>
  );
}
