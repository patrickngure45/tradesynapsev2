"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";

// --- Types ---
type Withdrawal = {
  id: string;
  user_id: string;
  symbol: string;
  chain: string;
  amount: string;
  destination_address: string;
  status: string;
  risk_score: number | null;
  risk_recommended_action: string | null;
  created_at: string;
};

type ReconciliationReport = {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
};

type DeadLetter = {
  id: string;
  topic: string;
  aggregate_type: string;
  aggregate_id: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

type KycSubmission = {
  id: string;
  user_id: string;
  document_type: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

type OnChainBalance = { symbol: string; balance: string; contractAddress: string | null };
type LedgerRow = {
  asset_id: string; symbol: string; chain: string;
  total_posted: string; total_held: string; total_available: string;
  num_accounts: string;
};
type FeeRow = { symbol: string; chain: string; total_fees: string };
type PendingWdRow = { symbol: string; chain: string; total_pending: string; count: string };
type UserCounts = { total: string; admins: string; with_email: string; with_ledger: string };
type WalletHealth = {
  pendingWithdrawals: number;
  pendingWithdrawalAmount: string;
  outboxOpen: number;
  outboxDead: number;
  outboxWithErrors: number;
  depositAddresses: number;
  allowlistApproved: number;
  hotWalletBnb: string;
  hotWalletHasGas: boolean;
};
type WalletData = {
  address: string;
  onChain: OnChainBalance[];
  assets: { id: string; chain: string; symbol: string; name: string | null; decimals: number }[];
  ledger: LedgerRow[];
  fees: FeeRow[];
  pendingWithdrawals: PendingWdRow[];
  health: WalletHealth;
  userCounts: UserCounts;
};

// --- Helpers ---
async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  if (!res.ok) throw new Error((json as any)?.error ?? `http_${res.status}`);
  return json as any;
}

function Badge({ text, variant }: { text: string; variant: "green" | "red" | "amber" | "blue" | "gray" }) {
  const colors = {
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    red: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    gray: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[variant]}`}>
      {text}
    </span>
  );
}

function statusBadgeVariant(status: string): "green" | "red" | "amber" | "blue" | "gray" {
  switch (status) {
    case "requested":
    case "needs_review":
      return "amber";
    case "approved":
    case "completed":
      return "green";
    case "rejected":
    case "failed":
      return "red";
    default:
      return "gray";
  }
}

// --- Admin Dashboard ---
function formatNum(val: string | number, decimals = 6): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n) || n === 0) return "0";
  const max = Math.min(20, Math.max(0, Number.isFinite(decimals) ? Math.floor(decimals) : 6));
  const min = Math.min(2, max);
  return n.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max });
}

function asNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeWalletData(raw: any): WalletData {
  const onChain = Array.isArray(raw?.onChain)
    ? raw.onChain.map((b: any) => ({
        symbol: asStr(b?.symbol, ""),
        balance: asStr(b?.balance, "0"),
        contractAddress: typeof b?.contractAddress === "string" ? b.contractAddress : null,
      }))
    : [];

  const assets = Array.isArray(raw?.assets)
    ? raw.assets.map((a: any) => ({
        id: asStr(a?.id, ""),
        chain: asStr(a?.chain, "bsc"),
        symbol: asStr(a?.symbol, ""),
        name: typeof a?.name === "string" ? a.name : null,
        decimals: asNum(a?.decimals, 18),
      }))
    : [];

  const ledger = Array.isArray(raw?.ledger)
    ? raw.ledger.map((row: any) => ({
        asset_id: asStr(row?.asset_id, ""),
        symbol: asStr(row?.symbol, ""),
        chain: asStr(row?.chain, "bsc"),
        total_posted: asStr(row?.total_posted, "0"),
        total_held: asStr(row?.total_held, "0"),
        total_available: asStr(row?.total_available, "0"),
        num_accounts: asStr(row?.num_accounts, "0"),
      }))
    : [];

  const fees = Array.isArray(raw?.fees)
    ? raw.fees.map((f: any) => ({
        symbol: asStr(f?.symbol, ""),
        chain: asStr(f?.chain, "bsc"),
        total_fees: asStr(f?.total_fees, "0"),
      }))
    : [];

  const pendingWithdrawals = Array.isArray(raw?.pendingWithdrawals)
    ? raw.pendingWithdrawals.map((pw: any) => ({
        symbol: asStr(pw?.symbol, ""),
        chain: asStr(pw?.chain, "bsc"),
        total_pending: asStr(pw?.total_pending, "0"),
        count: asStr(pw?.count, "0"),
      }))
    : [];

  return {
    address: asStr(raw?.address, ""),
    onChain,
    assets,
    ledger,
    fees,
    pendingWithdrawals,
    health: {
      pendingWithdrawals: asNum(raw?.health?.pendingWithdrawals, 0),
      pendingWithdrawalAmount: asStr(raw?.health?.pendingWithdrawalAmount, "0"),
      outboxOpen: asNum(raw?.health?.outboxOpen, 0),
      outboxDead: asNum(raw?.health?.outboxDead, 0),
      outboxWithErrors: asNum(raw?.health?.outboxWithErrors, 0),
      depositAddresses: asNum(raw?.health?.depositAddresses, 0),
      allowlistApproved: asNum(raw?.health?.allowlistApproved, 0),
      hotWalletBnb: asStr(raw?.health?.hotWalletBnb, "0"),
      hotWalletHasGas: Boolean(raw?.health?.hotWalletHasGas),
    },
    userCounts: {
      total: asStr(raw?.userCounts?.total, "0"),
      admins: asStr(raw?.userCounts?.admins, "0"),
      with_email: asStr(raw?.userCounts?.with_email, "0"),
      with_ledger: asStr(raw?.userCounts?.with_ledger, "0"),
    },
  };
}

export function AdminDashboardClient() {
  const [tab, setTab] = useState<"wallet" | "withdrawals" | "reconciliation" | "dead-letters" | "audit-log" | "kyc-review">("wallet");
  const [error, setError] = useState<string | null>(null);

  // Withdrawal state
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [wdFilter, setWdFilter] = useState<string>("review");
  const [wdLoading, setWdLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Reconciliation state
  const [reconReport, setReconReport] = useState<ReconciliationReport | null>(null);
  const [reconLoading, setReconLoading] = useState(false);

  // Dead-letter state
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [dlLoading, setDlLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState<string | null>(null);

  // KYC review state
  const [kycSubmissions, setKycSubmissions] = useState<KycSubmission[]>([]);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycActionLoading, setKycActionLoading] = useState<string | null>(null);
  const [kycFilter, setKycFilter] = useState<string>("pending_review");

  // Wallet state
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // Audit log state
  type AuditRow = {
    id: string; actor_id: string | null; actor_type: string; action: string;
    resource_type: string | null; resource_id: string | null; ip: string | null;
    detail: Record<string, unknown>; created_at: string;
  };
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditFilter, setAuditFilter] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);

  // Rejection modal state (shared by withdrawal + KYC reject)
  const [rejectModal, setRejectModal] = useState<{ open: boolean; kind: "withdrawal" | "kyc"; id: string }>({
    open: false, kind: "withdrawal", id: "",
  });
  const [rejectLoading, setRejectLoading] = useState(false);

  // Dead-letter pagination state
  const [dlTotal, setDlTotal] = useState(0);
  const [dlOffset, setDlOffset] = useState(0);
  const DL_PAGE_SIZE = 50;

  // KYC pagination state
  const [kycTotal, setKycTotal] = useState(0);
  const [kycOffset, setKycOffset] = useState(0);
  const KYC_PAGE_SIZE = 50;

  // KYC bulk selection
  const [kycSelected, setKycSelected] = useState<Set<string>>(new Set());
  const [kycBulkLoading, setKycBulkLoading] = useState(false);

  // --- Actions ---
  const fetchWithdrawals = useCallback(async () => {
    setWdLoading(true);
    setError(null);
    try {
      const data = await adminFetch(`/api/exchange/admin/withdrawals?status=${wdFilter}`);
      setWithdrawals(data.withdrawals ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setWdLoading(false);
    }
  }, [wdFilter]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    setError(null);
    try {
      await adminFetch(`/api/exchange/admin/withdrawals/${id}/approve`, { method: "POST" });
      await fetchWithdrawals();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = (id: string) => {
    setRejectModal({ open: true, kind: "withdrawal", id });
  };

  const submitReject = async (reason: string) => {
    const { kind, id } = rejectModal;
    setRejectLoading(true);
    setError(null);
    try {
      if (kind === "withdrawal") {
        await adminFetch(`/api/exchange/admin/withdrawals/${id}/reject`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        await fetchWithdrawals();
      } else {
        await adminFetch("/api/exchange/admin/kyc-review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ submission_id: id, decision: "rejected", rejection_reason: reason }),
        });
        await fetchKycSubmissions();
      }
      setRejectModal({ open: false, kind: "withdrawal", id: "" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRejectLoading(false);
    }
  };

  const fetchWallet = useCallback(async () => {
    setWalletLoading(true);
    setError(null);
    try {
      const data = await adminFetch("/api/exchange/admin/wallet");
      setWalletData(normalizeWalletData(data));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const fetchRecon = useCallback(async () => {
    setReconLoading(true);
    setError(null);
    try {
      const data = await adminFetch("/api/exchange/admin/reconciliation");
      setReconReport(data.reconciliation ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReconLoading(false);
    }
  }, []);

  const fetchDeadLetters = useCallback(async (offset = 0) => {
    setDlLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(DL_PAGE_SIZE), offset: String(offset) });
      const data = await adminFetch(`/api/exchange/admin/outbox/dead-letters?${params}`);
      setDeadLetters(data.dead_letters ?? []);
      setDlTotal(data.total ?? data.dead_letters?.length ?? 0);
      setDlOffset(offset);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDlLoading(false);
    }
  }, []);

  const handleRetryDeadLetter = async (id: string) => {
    setRetryLoading(id);
    setError(null);
    try {
      await adminFetch("/api/exchange/admin/outbox/dead-letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await fetchDeadLetters();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRetryLoading(null);
    }
  };

  const fetchKycSubmissions = useCallback(async (offset = 0) => {
    setKycLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: kycFilter, limit: String(KYC_PAGE_SIZE), offset: String(offset) });
      const data = await adminFetch(`/api/exchange/admin/kyc-review?${params}`);
      setKycSubmissions(data.submissions ?? []);
      setKycTotal(data.total ?? data.submissions?.length ?? 0);
      setKycOffset(offset);
      setKycSelected(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setKycLoading(false);
    }
  }, [kycFilter]);

  const handleKycApprove = async (id: string) => {
    setKycActionLoading(id);
    setError(null);
    try {
      await adminFetch("/api/exchange/admin/kyc-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submission_id: id, decision: "approved" }),
      });
      await fetchKycSubmissions();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setKycActionLoading(null);
    }
  };

  const handleKycReject = (id: string) => {
    setRejectModal({ open: true, kind: "kyc", id });
  };

  // Bulk KYC actions
  const toggleKycSelect = (id: string) => {
    setKycSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleKycSelectAll = () => {
    const pending = kycSubmissions.filter((s) => s.status === "pending_review");
    if (kycSelected.size === pending.length && pending.length > 0) {
      setKycSelected(new Set());
    } else {
      setKycSelected(new Set(pending.map((s) => s.id)));
    }
  };

  const handleBulkKycApprove = async () => {
    if (kycSelected.size === 0) return;
    setKycBulkLoading(true);
    setError(null);
    try {
      await Promise.all(
        Array.from(kycSelected).map((id) =>
          adminFetch("/api/exchange/admin/kyc-review", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ submission_id: id, decision: "approved" }),
          })
        )
      );
      setKycSelected(new Set());
      await fetchKycSubmissions(kycOffset);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setKycBulkLoading(false);
    }
  };

  const fetchAuditLog = useCallback(async (offset = 0) => {
    setAuditLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50", offset: String(offset) });
      if (auditFilter.trim()) params.set("action", auditFilter.trim());
      const data = await adminFetch(`/api/exchange/admin/audit-log?${params}`);
      setAuditRows(data.rows ?? []);
      setAuditTotal(data.total ?? 0);
      setAuditOffset(offset);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAuditLoading(false);
    }
  }, [auditFilter]);

  const refreshCurrentTab = useCallback(() => {
    if (tab === "wallet") return fetchWallet();
    if (tab === "withdrawals") return fetchWithdrawals();
    if (tab === "reconciliation") return fetchRecon();
    if (tab === "dead-letters") return fetchDeadLetters(0);
    if (tab === "audit-log") return fetchAuditLog(0);
    if (tab === "kyc-review") return fetchKycSubmissions(0);
  }, [tab, fetchWallet, fetchWithdrawals, fetchRecon, fetchDeadLetters, fetchAuditLog, fetchKycSubmissions]);

  // Auto-refresh on tab/filter change + polling
  useEffect(() => {
    refreshCurrentTab();
    const interval = setInterval(refreshCurrentTab, 30_000);
    return () => clearInterval(interval);
  }, [tab, wdFilter, kycFilter, refreshCurrentTab]);

  const isRefreshing =
    (tab === "wallet" && walletLoading) ||
    (tab === "withdrawals" && wdLoading) ||
    (tab === "reconciliation" && reconLoading) ||
    (tab === "dead-letters" && dlLoading) ||
    (tab === "kyc-review" && kycLoading) ||
    (tab === "audit-log" && auditLoading);

  return (
    <div className="mt-6 grid gap-6">
      {/* Error banner */}
      {error ? (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
          <button
            type="button"
            className="ml-3 text-[10px] underline"
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      ) : null}

      {/* Tab bar */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] text-xs">
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {(
            [
              { key: "wallet", label: "Wallet" },
              { key: "withdrawals", label: "Withdrawals" },
              { key: "reconciliation", label: "Reconciliation" },
              { key: "dead-letters", label: "Dead Letters" },
              { key: "kyc-review", label: "KYC Review" },
              { key: "audit-log", label: "Audit Log" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`px-4 py-2 transition ${
                tab === t.key
                  ? "border-b-2 border-[var(--accent)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="px-4 py-2 text-[var(--muted)] hover:text-[var(--foreground)]"
          onClick={refreshCurrentTab}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* ========== Wallet / All Balances ========== */}
      {tab === "wallet" ? (
        <div className="grid gap-6">
          {!walletData && !walletLoading && !error ? (
            <p className="text-xs text-[var(--muted)]">Loading wallet data...</p>
          ) : null}

          {walletData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">Hot Wallet</div>
                  <div className="mt-1 font-mono text-[11px] text-[var(--foreground)] break-all">{walletData.address}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">Registered Users</div>
                  <div className="mt-1 text-lg font-semibold text-[var(--foreground)]">{walletData.userCounts.with_email}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {walletData.userCounts.admins} admin · {walletData.userCounts.with_ledger} with ledger accounts · {walletData.userCounts.total} active users
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">Enabled Assets</div>
                  <div className="mt-1 text-lg font-semibold text-[var(--foreground)]">{walletData.assets.length}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {(() => {
                      const symbols = walletData.assets.map((a) => a.symbol).filter(Boolean);
                      const sample = symbols.slice(0, 12);
                      const more = Math.max(0, symbols.length - sample.length);
                      return `Sample: ${sample.join(" · ")}${more ? ` · +${more} more` : ""}`;
                    })()}
                  </div>
                </div>
              </div>

              {/* Fund Wiring Health */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold tracking-tight">Fund Wiring Health</h3>
                  <Badge
                    text={
                      walletData.health.hotWalletHasGas &&
                      walletData.health.pendingWithdrawals === 0 &&
                      walletData.health.outboxOpen === 0 &&
                      walletData.health.outboxDead === 0
                        ? "Healthy"
                        : "Needs Attention"
                    }
                    variant={
                      walletData.health.hotWalletHasGas &&
                      walletData.health.pendingWithdrawals === 0 &&
                      walletData.health.outboxOpen === 0 &&
                      walletData.health.outboxDead === 0
                        ? "green"
                        : "amber"
                    }
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">Live checks for queue, wallet gas, and movement rails</p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-[var(--border)] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Hot Wallet BNB</div>
                    <div className="mt-1 text-sm font-semibold">{formatNum(walletData.health.hotWalletBnb, 8)}</div>
                    <div className="mt-1">
                      <Badge text={walletData.health.hotWalletHasGas ? "Gas OK" : "Low Gas"} variant={walletData.health.hotWalletHasGas ? "green" : "red"} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--border)] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Pending Withdrawals</div>
                    <div className="mt-1 text-sm font-semibold">{walletData.health.pendingWithdrawals}</div>
                    <div className="mt-1 text-[10px] text-[var(--muted)]">Amount: {formatNum(walletData.health.pendingWithdrawalAmount)}</div>
                  </div>

                  <div className="rounded-lg border border-[var(--border)] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Fund Outbox</div>
                    <div className="mt-1 text-sm font-semibold">Open {walletData.health.outboxOpen} · Dead {walletData.health.outboxDead}</div>
                    <div className="mt-1 text-[10px] text-[var(--muted)]">Historical errors: {walletData.health.outboxWithErrors}</div>
                  </div>

                  <div className="rounded-lg border border-[var(--border)] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Deposit Rails</div>
                    <div className="mt-1 text-sm font-semibold">{walletData.health.depositAddresses} active addresses</div>
                  </div>

                  <div className="rounded-lg border border-[var(--border)] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Withdrawal Allowlist</div>
                    <div className="mt-1 text-sm font-semibold">{walletData.health.allowlistApproved} approved</div>
                  </div>
                </div>
              </div>

              {/* On-Chain Balances */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
                <h3 className="text-sm font-semibold tracking-tight">On-Chain Hot Wallet Balances</h3>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">Live balances on BSC for the exchange hot wallet</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                        <th className="px-3 py-2 font-medium">Asset</th>
                        <th className="px-3 py-2 text-right font-medium">Balance</th>
                        <th className="px-3 py-2 font-medium">Contract</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletData.onChain.map((b) => (
                        <tr key={b.symbol} className="border-b border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--card)_80%,transparent)]">
                          <td className="px-3 py-2.5 font-medium">{b.symbol}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{formatNum(b.balance)}</td>
                          <td className="px-3 py-2.5 font-mono text-[10px] text-[var(--muted)]">
                            {b.contractAddress ? `${b.contractAddress.slice(0, 10)}...${b.contractAddress.slice(-6)}` : "Native"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ledger Balances (Non-system Users Aggregated) */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
                <h3 className="text-sm font-semibold tracking-tight">Internal Ledger Balances (Users)</h3>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">Aggregate of non-system user balances on the exchange ledger</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                        <th className="px-3 py-2 font-medium">Asset</th>
                        <th className="px-3 py-2 font-medium">Chain</th>
                        <th className="px-3 py-2 text-right font-medium">Total Posted</th>
                        <th className="px-3 py-2 text-right font-medium">Total Held</th>
                        <th className="px-3 py-2 text-right font-medium">Total Available</th>
                        <th className="px-3 py-2 text-right font-medium">Accounts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletData.ledger.map((row) => (
                        <tr key={row.asset_id} className="border-b border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--card)_80%,transparent)]">
                          <td className="px-3 py-2.5 font-medium">{row.symbol}</td>
                          <td className="px-3 py-2.5">
                            <Badge text={row.chain.toUpperCase()} variant="blue" />
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">{formatNum(row.total_posted)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-amber-600 dark:text-amber-400">{formatNum(row.total_held)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatNum(row.total_available)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-[var(--muted)]">{row.num_accounts}</td>
                        </tr>
                      ))}
                      {walletData.ledger.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-4 text-center text-[var(--muted)]">No ledger entries</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Fees + Pending Withdrawals side by side */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Collected Fees */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
                  <h3 className="text-sm font-semibold tracking-tight">Collected Fees</h3>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">Total fees collected from trades</p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                          <th className="px-3 py-2 font-medium">Asset</th>
                          <th className="px-3 py-2 text-right font-medium">Total Fees</th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletData.fees.map((f) => (
                          <tr key={`${f.chain}-${f.symbol}`} className="border-b border-[var(--border)]">
                            <td className="px-3 py-2.5 font-medium">{f.symbol} <span className="text-[10px] text-[var(--muted)]">{f.chain.toUpperCase()}</span></td>
                            <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatNum(f.total_fees)}</td>
                          </tr>
                        ))}
                        {walletData.fees.length === 0 && (
                          <tr><td colSpan={2} className="px-3 py-4 text-center text-[var(--muted)]">No fees collected yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pending Withdrawals */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
                  <h3 className="text-sm font-semibold tracking-tight">Pending Withdrawals</h3>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">Withdrawals awaiting processing</p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                          <th className="px-3 py-2 font-medium">Asset</th>
                          <th className="px-3 py-2 text-right font-medium">Total Pending</th>
                          <th className="px-3 py-2 text-right font-medium">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletData.pendingWithdrawals.map((pw) => (
                          <tr key={`${pw.chain}-${pw.symbol}`} className="border-b border-[var(--border)]">
                            <td className="px-3 py-2.5 font-medium">{pw.symbol} <span className="text-[10px] text-[var(--muted)]">{pw.chain.toUpperCase()}</span></td>
                            <td className="px-3 py-2.5 text-right font-mono text-amber-600 dark:text-amber-400">{formatNum(pw.total_pending)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-[var(--muted)]">{pw.count}</td>
                          </tr>
                        ))}
                        {walletData.pendingWithdrawals.length === 0 && (
                          <tr><td colSpan={3} className="px-3 py-4 text-center text-[var(--muted)]">No pending withdrawals</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Coverage Ratio */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
                <h3 className="text-sm font-semibold tracking-tight">Reserve Coverage</h3>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">On-chain balance vs total user liabilities per asset</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                        <th className="px-3 py-2 font-medium">Asset</th>
                        <th className="px-3 py-2 text-right font-medium">On-Chain</th>
                        <th className="px-3 py-2 text-right font-medium">User Liabilities</th>
                        <th className="px-3 py-2 text-right font-medium">Surplus / Deficit</th>
                        <th className="px-3 py-2 text-right font-medium">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletData.onChain.map((oc) => {
                        const ledgerRow = walletData.ledger.find((l) => l.symbol === oc.symbol);
                        const onChain = parseFloat(oc.balance) || 0;
                        const liability = parseFloat(ledgerRow?.total_posted ?? "0");
                        const surplus = onChain - liability;
                        const coverage = liability > 0 ? ((onChain / liability) * 100) : (onChain > 0 ? 999 : 0);
                        const coverageText = coverage >= 999 ? ">999%" : `${coverage.toFixed(1)}%`;
                        return (
                          <tr key={oc.symbol} className="border-b border-[var(--border)]">
                            <td className="px-3 py-2.5 font-medium">{oc.symbol}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{formatNum(onChain)}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{formatNum(liability)}</td>
                            <td className={`px-3 py-2.5 text-right font-mono ${
                              surplus >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            }`}>{surplus >= 0 ? "+" : ""}{formatNum(surplus)}</td>
                            <td className="px-3 py-2.5 text-right">
                              <Badge
                                text={coverageText}
                                variant={coverage >= 100 ? "green" : coverage >= 80 ? "amber" : "red"}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ========== Withdrawals ========== */}
      {tab === "withdrawals" ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--muted)]">Filter:</span>
            {["review", "requested", "needs_review", "approved", "rejected", "completed", "failed"].map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  className={`rounded-full px-3 py-1 text-[11px] transition ${
                    wdFilter === s
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                  onClick={() => setWdFilter(s)}
                >
                  {s}
                </button>
              )
            )}
          </div>

          {withdrawals.length === 0 && !wdLoading ? (
            <p className="text-xs text-[var(--muted)]">No withdrawals match this filter.</p>
          ) : null}

          <div className="grid gap-2">
            {withdrawals.map((w) => (
              <div
                key={w.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">
                        {w.amount} {w.symbol}
                      </span>
                      <Badge text={w.status} variant={statusBadgeVariant(w.status)} />
                      {w.risk_score !== null ? (
                        <Badge
                          text={`risk: ${w.risk_score}`}
                          variant={w.risk_score >= 70 ? "red" : w.risk_score >= 40 ? "amber" : "green"}
                        />
                      ) : null}
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">
                      To: <span className="font-mono">{w.destination_address}</span>
                    </div>
                    <div className="flex gap-3 text-[11px] text-[var(--muted)]">
                      <span>User: {w.user_id.slice(0, 8)}...</span>
                      <span>{w.chain.toUpperCase()}</span>
                      <span>{new Date(w.created_at).toLocaleString()}</span>
                    </div>
                    {w.risk_recommended_action ? (
                      <div className="text-[11px] text-amber-700 dark:text-amber-300">
                        Recommended: {w.risk_recommended_action}
                      </div>
                    ) : null}
                  </div>

                  {(w.status === "requested" || w.status === "needs_review") ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600 px-4 py-2.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        disabled={actionLoading === w.id}
                        onClick={() => handleApprove(w.id)}
                      >
                        {actionLoading === w.id ? "..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-rose-600 px-4 py-2.5 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                        disabled={actionLoading === w.id}
                        onClick={() => handleReject(w.id)}
                      >
                        {actionLoading === w.id ? "..." : "Reject"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ========== Reconciliation ========== */}
      {tab === "reconciliation" ? (
        <div className="grid gap-4">
          <button
            type="button"
            className="w-fit rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-4 py-2 text-xs font-semibold text-white shadow-[var(--shadow)] disabled:opacity-60"
            disabled={reconLoading}
            onClick={fetchRecon}
          >
            {reconLoading ? "Running..." : "Run Full Reconciliation"}
          </button>

          {reconReport ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">Result</h3>
                <Badge
                  text={reconReport.ok ? "PASS" : "FAIL"}
                  variant={reconReport.ok ? "green" : "red"}
                />
              </div>
              <div className="mt-3 grid gap-2">
                {(reconReport.checks ?? []).map((c, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded border border-[var(--border)] px-3 py-2 text-xs"
                  >
                    <span className={c.ok ? "text-emerald-600" : "text-rose-600"}>
                      {c.ok ? "PASS" : "FAIL"}
                    </span>
                    <span className="font-medium">{c.name}</span>
                    {c.detail ? (
                      <span className="text-[var(--muted)]">{c.detail}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ========== Dead Letters ========== */}
      {tab === "dead-letters" ? (
        <div className="grid gap-4">
          <div className="flex items-center gap-3">
            <span className="ml-auto text-[11px] text-[var(--muted)]">
              {dlTotal} total{dlTotal > DL_PAGE_SIZE ? ` · showing ${dlOffset + 1}–${Math.min(dlOffset + DL_PAGE_SIZE, dlTotal)}` : ""}
            </span>
          </div>

          {deadLetters.length === 0 && !dlLoading ? (
            <p className="text-xs text-[var(--muted)]">No dead-lettered events.</p>
          ) : null}

          <div className="grid gap-2">
            {deadLetters.map((dl) => (
              <div
                key={dl.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <Badge text={dl.topic} variant="blue" />
                      <span className="font-mono text-[11px] text-[var(--muted)]">{dl.id.slice(0, 8)}...</span>
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {dl.aggregate_type}:{dl.aggregate_id.slice(0, 8)}... · Attempts: {dl.attempts}
                    </div>
                    {dl.last_error ? (
                      <div className="mt-1 max-w-md truncate rounded bg-rose-50 px-2 py-1 font-mono text-[10px] text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                        {dl.last_error}
                      </div>
                    ) : null}
                    <div className="text-[10px] text-[var(--muted)]">
                      {new Date(dl.created_at).toLocaleString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={retryLoading === dl.id}
                    onClick={() => handleRetryDeadLetter(dl.id)}
                  >
                    {retryLoading === dl.id ? "..." : "Retry"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Dead-letter pagination */}
          {dlTotal > DL_PAGE_SIZE && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={dlOffset === 0 || dlLoading}
                onClick={() => fetchDeadLetters(Math.max(0, dlOffset - DL_PAGE_SIZE))}
                className="rounded border border-[var(--border)] px-3 py-2 text-[11px] transition hover:text-[var(--foreground)] disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={dlOffset + DL_PAGE_SIZE >= dlTotal || dlLoading}
                onClick={() => fetchDeadLetters(dlOffset + DL_PAGE_SIZE)}
                className="rounded border border-[var(--border)] px-3 py-2 text-[11px] transition hover:text-[var(--foreground)] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* ========== KYC Review ========== */}
      {tab === "kyc-review" ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--muted)]">Filter:</span>
            {["pending_review", "approved", "rejected"].map((s) => (
              <button
                key={s}
                type="button"
                className={`rounded-full px-3 py-1 text-[11px] transition ${
                  kycFilter === s
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setKycFilter(s)}
              >
                {s.replace("_", " ")}
              </button>
            ))}
            <span className="text-[11px] text-[var(--muted)]">
              {kycTotal} total{kycTotal > KYC_PAGE_SIZE ? ` · ${kycOffset + 1}–${Math.min(kycOffset + KYC_PAGE_SIZE, kycTotal)}` : ""}
            </span>
          </div>

          {/* Bulk action bar */}
          {kycFilter === "pending_review" && kycSubmissions.some((s) => s.status === "pending_review") ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={
                    kycSelected.size > 0 &&
                    kycSelected.size === kycSubmissions.filter((s) => s.status === "pending_review").length
                  }
                  onChange={toggleKycSelectAll}
                  className="accent-[var(--accent)]"
                />
                Select all
              </label>
              {kycSelected.size > 0 ? (
                <>
                  <span className="text-[11px] text-[var(--foreground)]">{kycSelected.size} selected</span>
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    disabled={kycBulkLoading}
                    onClick={handleBulkKycApprove}
                  >
                    {kycBulkLoading ? "..." : `Approve ${kycSelected.size}`}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {kycSubmissions.length === 0 && !kycLoading ? (
            <p className="text-xs text-[var(--muted)]">No KYC submissions match this filter.</p>
          ) : null}

          <div className="grid gap-2">
            {kycSubmissions.map((sub) => (
              <div
                key={sub.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Bulk checkbox */}
                    {sub.status === "pending_review" ? (
                      <input
                        type="checkbox"
                        checked={kycSelected.has(sub.id)}
                        onChange={() => toggleKycSelect(sub.id)}
                        className="mt-0.5 accent-[var(--accent)]"
                      />
                    ) : null}
                    <div className="grid gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{sub.document_type.replace("_", " ")}</span>
                        <Badge
                          text={sub.status.replace("_", " ")}
                          variant={sub.status === "approved" ? "green" : sub.status === "rejected" ? "red" : "amber"}
                        />
                      </div>
                      <div className="flex gap-3 text-[11px] text-[var(--muted)]">
                        <span>User: {sub.user_id.slice(0, 8)}...</span>
                        <span>{new Date(sub.created_at).toLocaleString()}</span>
                      </div>
                      {sub.rejection_reason ? (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400">
                          Reason: {sub.rejection_reason}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {sub.status === "pending_review" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600 px-4 py-2.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        disabled={kycActionLoading === sub.id}
                        onClick={() => handleKycApprove(sub.id)}
                      >
                        {kycActionLoading === sub.id ? "..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-rose-600 px-4 py-2.5 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                        disabled={kycActionLoading === sub.id}
                        onClick={() => handleKycReject(sub.id)}
                      >
                        {kycActionLoading === sub.id ? "..." : "Reject"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* KYC pagination */}
          {kycTotal > KYC_PAGE_SIZE && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={kycOffset === 0 || kycLoading}
                onClick={() => fetchKycSubmissions(Math.max(0, kycOffset - KYC_PAGE_SIZE))}
                className="rounded border border-[var(--border)] px-3 py-2 text-[11px] transition hover:text-[var(--foreground)] disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={kycOffset + KYC_PAGE_SIZE >= kycTotal || kycLoading}
                onClick={() => fetchKycSubmissions(kycOffset + KYC_PAGE_SIZE)}
                className="rounded border border-[var(--border)] px-3 py-2 text-[11px] transition hover:text-[var(--foreground)] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* ========== Audit Log ========== */}
      {tab === "audit-log" ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Filter by action (e.g. auth.totp)"
              className="rounded border border-[var(--border)] bg-transparent px-3 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") fetchAuditLog(0); }}
            />
            <button
              type="button"
              className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => fetchAuditLog(0)}
              disabled={auditLoading}
            >
              {auditLoading ? "Loading..." : "Search"}
            </button>
            <span className="ml-auto text-[11px] text-[var(--muted)]">
              {auditTotal} total · showing {auditOffset + 1}–{Math.min(auditOffset + 50, auditTotal)}
            </span>
          </div>

          {auditRows.length === 0 && !auditLoading ? (
            <p className="text-xs text-[var(--muted)]">No audit log entries match this filter.</p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="px-2 py-1.5 font-medium">Time</th>
                  <th className="px-2 py-1.5 font-medium">Action</th>
                  <th className="px-2 py-1.5 font-medium">Actor</th>
                  <th className="px-2 py-1.5 font-medium">Resource</th>
                  <th className="px-2 py-1.5 font-medium">IP</th>
                  <th className="px-2 py-1.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--card)_80%,transparent)]">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[var(--muted)]">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge text={row.action} variant="blue" />
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {row.actor_id ? `${row.actor_id.slice(0, 8)}... (${row.actor_type})` : row.actor_type}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.resource_type ? (
                        <span className="font-mono">
                          {row.resource_type}:{row.resource_id?.slice(0, 8) ?? "—"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[var(--muted)]">{row.ip ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-2 py-1.5 font-mono text-[10px] text-[var(--muted)]">
                      {Object.keys(row.detail ?? {}).length > 0 ? JSON.stringify(row.detail) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {auditTotal > 50 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={auditOffset === 0 || auditLoading}
                onClick={() => fetchAuditLog(Math.max(0, auditOffset - 50))}
                className="rounded border border-[var(--border)] px-3 py-2 text-[11px] transition hover:text-[var(--foreground)] disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={auditOffset + 50 >= auditTotal || auditLoading}
                onClick={() => fetchAuditLog(auditOffset + 50)}
                className="rounded border border-[var(--border)] px-3 py-2 text-[11px] transition hover:text-[var(--foreground)] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* ========== Rejection Modal ========== */}
      <Modal
        open={rejectModal.open}
        title={rejectModal.kind === "withdrawal" ? "Reject Withdrawal" : "Reject KYC Submission"}
        description="Please provide a reason for rejection. This will be recorded in the audit log."
        variant="prompt"
        confirmLabel="Reject"
        confirmClass="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
        promptPlaceholder="Enter rejection reason…"
        loading={rejectLoading}
        onConfirm={submitReject}
        onCancel={() => setRejectModal({ open: false, kind: "withdrawal", id: "" })}
      />
    </div>
  );
}
