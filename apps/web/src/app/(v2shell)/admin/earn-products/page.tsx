import Link from "next/link";

import { v2ButtonClassName } from "@/components/v2/Button";
import { EarnProductsAdminClient } from "@/app/admin/earn-products/EarnProductsAdminClient";

export const dynamic = "force-dynamic";

export default function AdminEarnProductsPage() {
  return (
    <main className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Operations</div>
          <h1 className="text-2xl font-extrabold tracking-tight">Earn Products</h1>
          <p className="text-sm text-[var(--v2-muted)]">Enable/disable products and edit APR for the Earn UI.</p>
        </div>
        <Link href="/admin" className={v2ButtonClassName({ variant: "secondary", size: "sm" })}>
          Back to Admin
        </Link>
      </header>

      <EarnProductsAdminClient />
    </main>
  );
}
