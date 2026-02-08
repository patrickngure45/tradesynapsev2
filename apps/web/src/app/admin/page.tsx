import type { Metadata } from "next";
import { AdminDashboardClient } from "./AdminDashboardClient";

export const metadata: Metadata = { title: "Admin · TradeSynapse" };
export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">Admin Dashboard</h1>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Withdrawal review · Ledger reconciliation · Outbox dead-letters
      </p>
      <AdminDashboardClient />
    </main>
  );
}
