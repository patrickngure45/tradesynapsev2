"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import { ApiErrorBanner, type ClientApiError } from"@/components/ApiErrorBanner";
import { Toast, type ToastKind } from"@/components/Toast";
import { persistActingUserIdPreference, readActingUserIdPreference } from"@/lib/state/actingUser";

type Asset = {
 id: string;
 chain: string;
 symbol: string;
 name: string | null;
 contract_address: string | null;
 decimals: number;
};

type BalanceRow = {
 asset_id: string;
 chain: string;
 symbol: string;
 decimals: number;
 posted: string;
 held: string;
 available: string;
};

type Hold = {
 id: string;
 asset_id: string;
 chain: string;
 symbol: string;
 amount: string;
 reason: string;
 status:"active"|"released"|"consumed";
};

type DevUser = { id: string; status: string };

type AllowlistRow = {
 id: string;
 chain: string;
 address: string;
 label: string | null;
 status: string;
 created_at: string;
};

type WithdrawalRow = {
 id: string;
 asset_id: string;
 symbol: string;
 chain: string;
 amount: string;
 destination_address: string;
 status: string;
 hold_id: string | null;
 created_at: string;
};

type AdminWithdrawalRow = {
 id: string;
 user_id: string;
 asset_id: string;
 symbol: string;
 chain: string;
 amount: string;
 destination_address: string;
 status: string;
 hold_id: string | null;
 reference: string | null;
 risk_score: number | null;
 risk_recommended_action: string | null;
 risk_model_version: string | null;
 risk_created_at: string | null;
 created_at: string;
};

function isUuid(value: string): boolean {
 const v = value.trim();
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function fmtAmount(value: string, decimals: number): string {
 const n = Number(value);
 if (!Number.isFinite(n)) return value;
 const places = Math.min(Math.max(decimals, 0), 8);
 return n.toLocaleString(undefined, { maximumFractionDigits: places });
}

export function ExchangeWalletClient({ isAdmin }: { isAdmin?: boolean }) {
 const [loadingAction, setLoadingAction] = useState<string | null>(null);
 const [error, setError] = useState<ClientApiError | null>(null);

 const [assets, setAssets] = useState<Asset[]>([]);
 const [balances, setBalances] = useState<BalanceRow[]>([]);
 const [holds, setHolds] = useState<Hold[]>([]);

 const [authMode, setAuthMode] = useState<"session"|"header">("session");
 const [actingUserId, setActingUserId] = useState<string>(() => {
 if (typeof window ==="undefined") return"";
 return readActingUserIdPreference();
 });

 const [devUsers, setDevUsers] = useState<DevUser[]>([]);

 const [allowlist, setAllowlist] = useState<AllowlistRow[]>([]);
 const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);

 const [newAllowlistAddress, setNewAllowlistAddress] = useState<string>("");
 const [newAllowlistLabel, setNewAllowlistLabel] = useState<string>("");

 const [withdrawAssetId, setWithdrawAssetId] = useState<string>("");
 const [withdrawAmount, setWithdrawAmount] = useState<string>("");
 const [withdrawDestination, setWithdrawDestination] = useState<string>("");
 const [withdrawTotpCode, setWithdrawTotpCode] = useState<string>("");

 const [depositSymbol, setDepositSymbol] = useState<string>("USDT");
 const [depositAmount, setDepositAmount] = useState<string>("25");
 const [depositTxHash, setDepositTxHash] = useState<string>("");
 const [depositAddress, setDepositAddress] = useState<string | null>(null);
 const [depositAddressLoading, setDepositAddressLoading] = useState(false);
 const [depositAddressCopied, setDepositAddressCopied] = useState(false);

 const [adminKey, setAdminKey] = useState<string>("");
 const [adminId, setAdminId] = useState<string>("admin@local");
 const [adminRequested, setAdminRequested] = useState<AdminWithdrawalRow[]>([]);

 const [holdAssetId, setHoldAssetId] = useState<string>("");
 const [holdAmount, setHoldAmount] = useState<string>("");
 const [holdReason, setHoldReason] = useState<string>("order_hold");

 const [creditSymbol, setCreditSymbol] = useState<string>("USDT");
 const [creditAmount, setCreditAmount] = useState<string>("100");

 const [toastMessage, setToastMessage] = useState<string | null>(null);
 const [toastKind, setToastKind] = useState<ToastKind>("info");

 const isProd = process.env.NODE_ENV ==="production";

 const requestHeaders = useMemo(() => {
 if (authMode !=="header") return undefined;
 const id = actingUserId.trim();
 if (!id) return undefined;
 return {"x-user-id": id };
 }, [authMode, actingUserId]);

 async function refreshAll() {
 setLoadingAction("refresh");
 setError(null);

 try {
 const a = await fetchJsonOrThrow<{ assets: Asset[] }>("/api/exchange/assets", {
 cache:"no-store",
 });
 setAssets(a.assets ?? []);

 const b = await fetchJsonOrThrow<{ user_id: string; balances: BalanceRow[] }>(
"/api/exchange/balances",
 {
 cache:"no-store",
 headers: requestHeaders,
 }
 );
 setBalances(b.balances ?? []);

 try {
 const h = await fetchJsonOrThrow<{ holds: Hold[] }>("/api/exchange/holds?status=all", {
 cache:"no-store",
 headers: requestHeaders,
 });
 setHolds(h.holds ?? []);
 } catch {
 setHolds([]);
 }

 // Withdrawals are behind auth; keep them best-effort so balances still load.
 try {
 const wl = await fetchJsonOrThrow<{ addresses: AllowlistRow[] }>(
"/api/exchange/withdrawals/allowlist",
 { cache:"no-store", headers: requestHeaders }
 );
 setAllowlist(wl.addresses ?? []);
 } catch {
 setAllowlist([]);
 }

 try {
 const w = await fetchJsonOrThrow<{ withdrawals: WithdrawalRow[] }>(
"/api/exchange/withdrawals",
 { cache:"no-store", headers: requestHeaders }
 );
 setWithdrawals(w.withdrawals ?? []);
 } catch {
 setWithdrawals([]);
 }

 if (!holdAssetId && a.assets?.[0]?.id) setHoldAssetId(a.assets[0].id);
 if (!withdrawAssetId && a.assets?.[0]?.id) setWithdrawAssetId(a.assets[0].id);
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }

 useEffect(() => {
 void refreshAll();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [authMode]);

 useEffect(() => {
 if (true) return;
 void (async () => {
 try {
 const res = await fetch("/api/dev/users", {
 cache:"no-store",
 credentials:"same-origin",
 });
 const json = (await res.json().catch(() => null)) as { users?: DevUser[] } | null;
 setDevUsers(json?.users ?? []);
 } catch {
 // ignore
 }
 })();
 }, [isProd]);

 const canUseHeader = actingUserId.trim() && isUuid(actingUserId.trim());

 const adminHeaders = useMemo(() => {
 const h: Record<string, string> = {};
 if (adminKey.trim()) h["x-admin-key"] = adminKey.trim();
 if (adminId.trim()) h["x-admin-id"] = adminId.trim();
 return h;
 }, [adminKey, adminId]);

 return (
 <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
 <Toast message={toastMessage} kind={toastKind} onDone={() => setToastMessage(null)} />

 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="text-lg font-medium">Trading Balance (P2P & Spot)</h2>
 <p className="mt-1 text-sm text-[var(--muted)]">
 Funds available for P2P trading and spot markets.
 </p>
 </div>

 <button
 type="button"
 className="rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={loadingAction === "refresh"}
 onClick={() => void refreshAll()}
 >
 {loadingAction === "refresh" ?"Refreshing…":"Refresh"}
 </button>
 </div>

 <div className="mt-4 grid gap-3">
 <ApiErrorBanner error={error} className="p-3"onRetry={() => void refreshAll()} />

 {/* ── Deposit Address ─────────────────────────────── */}
 <div className="mt-2 rounded border border-[var(--border)] bg-[var(--card)]/50 p-4 hidden">
 <h3 className="text-sm font-medium">Deposit (BSC)</h3>
 <p className="mt-1 text-[11px] text-[var(--muted)]">
 Send BEP-20 tokens (TST, USDT) or BNB to your unique deposit address. The deposit watcher credits your ledger automatically.
 </p>
 {depositAddress ? (
 <div className="mt-2 flex flex-wrap items-center gap-2">
 <code className="min-w-0 break-all rounded bg-[var(--border)] px-2.5 py-1.5 font-mono text-xs text-[var(--foreground)]">
 {depositAddress}
 </code>
 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--card)_90%,transparent)]"
 onClick={() => {
 void navigator.clipboard.writeText(depositAddress);
 setDepositAddressCopied(true);
 setTimeout(() => setDepositAddressCopied(false), 2000);
 }}
 >
 {depositAddressCopied ?"Copied!":"Copy"}
 </button>
 </div>
 ) : (
 <button
 type="button"
 className="mt-2 rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--background)] disabled:opacity-60"
 disabled={depositAddressLoading || (authMode ==="header"&& !canUseHeader)}
 onClick={async () => {
 setDepositAddressLoading(true);
 setError(null);
 try {
 const res = await fetchJsonOrThrow<{ address: string }>(
"/api/exchange/deposit/address",
 {
 method:"POST",
 headers: {
"content-type":"application/json",
 ...(requestHeaders ?? {}),
 },
 }
 );
 setDepositAddress(res.address);
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setDepositAddressLoading(false);
 }
 }}
 >
 {depositAddressLoading ?"Generating…":"Generate deposit address"}
 </button>
 )}
 </div>

 <div className="mt-2">
 <h3 className="text-sm font-medium">Balances</h3>
 <div className="mt-2 overflow-x-auto rounded border border-[var(--border)]">
 <table className="w-full text-left text-xs">
 <thead className="bg-[var(--card)] text-[var(--muted)]">
 <tr>
 <th className="px-3 py-2">Asset</th>
 <th className="px-3 py-2">Total</th>
 <th className="px-3 py-2">Held</th>
 <th className="px-3 py-2">Available</th>
 <th className="px-3 py-2 text-right">Actions</th>
 </tr>
 </thead>
 <tbody>
 {balances.length === 0 ? (
 <tr>
 <td className="px-3 py-3 text-[var(--muted)]" colSpan={5}>
 No balances yet.
 </td>
 </tr>
 ) : (
 balances.map((b) => (
 <tr key={b.asset_id} className="border-t border-[var(--border)]">
 <td className="px-3 py-2">
 <div className="font-medium">
 {b.symbol} <span className="text-[var(--muted)]">({b.chain})</span>
 </div>
 </td>
 <td className="px-3 py-2 font-mono">{fmtAmount(b.posted, b.decimals)}</td>
 <td className="px-3 py-2 font-mono">{fmtAmount(b.held, b.decimals)}</td>
 <td className="px-3 py-2 font-mono font-bold text-[var(--foreground)]">{fmtAmount(b.available, b.decimals)}</td>
 <td className="px-3 py-2 text-right">
 <div className="flex justify-end gap-2">
 <Link 
 href={`/p2p?side=BUY&asset=${b.symbol}`}
 className="rounded bg-[var(--up)]/10 px-2 py-1 text-[10px] font-bold text-[var(--up)] hover:bg-[var(--up)]/20"
 >
 BUY
 </Link>
 <Link 
 href={`/p2p?side=SELL&asset=${b.symbol}`}
 className="rounded bg-[var(--down)]/10 px-2 py-1 text-[10px] font-bold text-[var(--down)] hover:bg-[var(--down)]/20"
 >
 SELL
 </Link>
 </div>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>

 <div className="mt-2 grid gap-3 md:grid-cols-2">
 <div className="rounded-xl border border-[var(--border)] p-4 hidden">
 <h3 className="text-sm font-medium">Create hold</h3>
 <div className="mt-3 grid gap-2">
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Asset</span>
 <select
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
 value={holdAssetId}
 onChange={(e) => setHoldAssetId(e.target.value)}
 >
 <option value="">(select)</option>
 {assets.map((a) => (
 <option key={a.id} value={a.id}>
 {a.symbol} ({a.chain})
 </option>
 ))}
 </select>
 </label>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Amount</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={holdAmount}
 onChange={(e) => setHoldAmount(e.target.value)}
 placeholder="e.g. 25"
 inputMode="decimal"
 />
 </label>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Reason</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
 value={holdReason}
 onChange={(e) => setHoldReason(e.target.value)}
 placeholder="order_hold"
 />
 </label>

 <button
 type="button"
 className="mt-1 w-fit rounded bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-60"
 disabled={loadingAction === "hold:create" || !holdAssetId || !holdAmount || (authMode ==="header"&& !canUseHeader)}
 onClick={async () => {
 setLoadingAction("hold:create");
 setError(null);
 try {
 const res = await fetchJsonOrThrow<{ hold?: { id: string; asset_id: string; amount: string; reason: string; status: string } }>(
"/api/exchange/holds",
 {
 method:"POST",
 headers: {
"content-type":"application/json",
 ...(requestHeaders ?? {}),
 },
 body: JSON.stringify({
 asset_id: holdAssetId,
 amount: holdAmount,
 reason: holdReason,
 }),
 }
 );

 if (!res.hold?.id) throw new Error("hold_create_missing_id");

 setToastKind("success");
 setToastMessage("Hold created.");
 await refreshAll();
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }}
 >
 Create hold
 </button>
 </div>
 </div>

 <div className="rounded-xl border border-[var(--border)] p-4 hidden">
 <h3 className="text-sm font-medium">Holds (this page)</h3>
 <p className="mt-1 text-xs text-[var(--muted)]">
 Holds are loaded from the server.
 </p>

 <div className="mt-3 grid gap-2">
 {holds.length === 0 ? (
 <div className="text-xs text-[var(--muted)]">No holds created yet.</div>
 ) : (
 holds.map((h) => (
 <div
 key={h.id}
 className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2 text-xs"
 >
 <div className="min-w-0 flex-1">
 <div className="font-medium">
 {h.symbol} {h.amount} <span className="text-[var(--muted)]">({h.status})</span>
 </div>
 <div className="truncate max-w-[8rem] font-mono text-[11px] text-[var(--muted)]" title={h.id}>{h.id}</div>
 </div>

 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={loadingAction === `hold:release:${h.id}` || h.status !=="active"|| (authMode ==="header"&& !canUseHeader)}
 onClick={async () => {
 setLoadingAction(`hold:release:${h.id}`);
 setError(null);
 try {
 await fetchJsonOrThrow<{ ok: true }>(`/api/exchange/holds/${h.id}`, {
 method:"DELETE",
 headers: requestHeaders,
 });
 setToastKind("success");
 setToastMessage("Hold released.");
 await refreshAll();
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }}
 >
 Release
 </button>
 </div>
 ))
 )}
 </div>
 </div>
 </div>

 <div className="mt-2 rounded-xl border border-[var(--border)] p-4">
 <h3 className="text-sm font-medium">Withdrawals (allowlist-first)</h3>
 <p className="mt-1 text-xs text-[var(--muted)]">
 Create an allowlisted destination, then request a withdrawal (creates a hold).
 </p>

 <div className="mt-3 grid gap-3 md:grid-cols-2">
 <div className="rounded-lg border border-[var(--border)] p-3">
 <div className="text-xs font-medium">Allowlist</div>
 <div className="mt-2 grid gap-2">
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Address (BSC)</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={newAllowlistAddress}
 onChange={(e) => setNewAllowlistAddress(e.target.value)}
 placeholder="0x..."
 autoCapitalize="none"
 autoCorrect="off"
 spellCheck={false}
 disabled={isProd}
 />
 </label>
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Label (optional)</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
 value={newAllowlistLabel}
 onChange={(e) => setNewAllowlistLabel(e.target.value)}
 placeholder="My Ledger"
 disabled={isProd}
 />
 </label>

 <button
 type="button"
 className="mt-1 w-fit rounded bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-60"
 disabled={
 loadingAction === "allowlist:add" ||
 isProd ||
 !newAllowlistAddress ||
 (authMode ==="header"&& !canUseHeader)
 }
 onClick={async () => {
 setLoadingAction("allowlist:add");
 setError(null);
 try {
 await fetchJsonOrThrow("/api/exchange/withdrawals/allowlist", {
 method:"POST",
 headers: {
"content-type":"application/json",
 ...(requestHeaders ?? {}),
 },
 body: JSON.stringify({
 chain:"bsc",
 address: newAllowlistAddress,
 label: newAllowlistLabel ? newAllowlistLabel : undefined,
 }),
 });
 setToastKind("success");
 setToastMessage("Allowlist updated.");
 setNewAllowlistAddress("");
 setNewAllowlistLabel("");
 await refreshAll();
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }}
 >
 Add allowlisted address
 </button>

 <div className="mt-2 grid gap-1">
 {allowlist.length === 0 ? (
 <div className="text-xs text-[var(--muted)]">No allowlisted addresses.</div>
 ) : (
 allowlist.map((row) => (
 <button
 key={row.id}
 type="button"
 className="rounded border border-[var(--border)] px-2 py-2 text-left text-[11px] hover:bg-[var(--card)]"
 onClick={() => setWithdrawDestination(row.address)}
 disabled={row.status !=="active"}
 title="Click to use as destination"
 >
 <div className="flex items-center justify-between gap-2">
 <span className="truncate font-mono" title={row.address}>{row.address}</span>
 <span className="text-[var(--muted)]">{row.status}</span>
 </div>
 {row.label ? <div className="text-[var(--muted)]">{row.label}</div> : null}
 </button>
 ))
 )}
 </div>
 </div>
 </div>

 <div className="rounded-lg border border-[var(--border)] p-3">
 <div className="text-xs font-medium">Request withdrawal</div>
 <div className="mt-2 grid gap-2">
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Asset</span>
 <select
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
 value={withdrawAssetId}
 onChange={(e) => setWithdrawAssetId(e.target.value)}
 >
 <option value="">(select)</option>
 {assets.map((a) => (
 <option key={a.id} value={a.id}>
 {a.symbol} ({a.chain})
 </option>
 ))}
 </select>
 </label>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Amount</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={withdrawAmount}
 onChange={(e) => setWithdrawAmount(e.target.value)}
 placeholder="e.g. 10"
 inputMode="decimal"
 />
 </label>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Destination (allowlisted)</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={withdrawDestination}
 onChange={(e) => setWithdrawDestination(e.target.value)}
 placeholder="0x..."
 autoCapitalize="none"
 autoCorrect="off"
 spellCheck={false}
 />
 </label>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">2FA Code (if enabled)</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={withdrawTotpCode}
 onChange={(e) => setWithdrawTotpCode(e.target.value.replace(/\D/g,"").slice(0, 6))}
 placeholder="6-digit code"
 inputMode="numeric"
 maxLength={6}
 autoComplete="one-time-code"
 />
 </label>

 <button
 type="button"
 className="mt-1 w-fit rounded bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-60"
 disabled={
 loadingAction === "withdraw:request" ||
 !withdrawAssetId ||
 !withdrawAmount ||
 !(parseFloat(withdrawAmount) > 0) ||
 !withdrawDestination ||
 (authMode ==="header"&& !canUseHeader)
 }
 onClick={async () => {
 if (!confirm(`Withdraw ${withdrawAmount} to ${withdrawDestination}? Funds will be held immediately.`)) return;
 setLoadingAction("withdraw:request");
 setError(null);
 try {
 await fetchJsonOrThrow("/api/exchange/withdrawals/request", {
 method:"POST",
 headers: {
"content-type":"application/json",
 ...(requestHeaders ?? {}),
 },
 body: JSON.stringify({
 asset_id: withdrawAssetId,
 amount: withdrawAmount,
 destination_address: withdrawDestination,
 ...(withdrawTotpCode.length === 6 ? { totp_code: withdrawTotpCode } : {}),
 }),
 });
 setToastKind("success");
 setToastMessage("Withdrawal requested (funds held).");
 setWithdrawAmount("");
 setWithdrawTotpCode("");
 await refreshAll();
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }}
 >
 Request withdrawal
 </button>

 <div className="mt-2 grid gap-2">
 {withdrawals.length === 0 ? (
 <div className="text-xs text-[var(--muted)]">No withdrawal requests.</div>
 ) : (
 withdrawals.map((w) => (
 <div
 key={w.id}
 className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-2 py-2 text-[11px]"
 >
 <div className="min-w-0 flex-1">
 <div className="font-medium break-all">
 {w.symbol} {w.amount} → <span className="font-mono">{w.destination_address}</span>
 </div>
 <div className="truncate max-w-[8rem] font-mono text-[var(--muted)]" title={w.id}>
 {w.id} <span className="ml-2">({w.status})</span>
 </div>
 </div>
 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={
 loadingAction === `withdraw:cancel:${w.id}` ||
 w.status !=="requested"||
 (authMode ==="header"&& !canUseHeader)
 }
 onClick={async () => {
 setLoadingAction(`withdraw:cancel:${w.id}`);
 setError(null);
 try {
 await fetchJsonOrThrow(`/api/exchange/withdrawals/${w.id}/cancel`, {
 method:"POST",
 headers: requestHeaders,
 });
 setToastKind("success");
 setToastMessage("Withdrawal canceled.");
 await refreshAll();
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }}
 >
 Cancel
 </button>
 </div>
 ))
 )}
 </div>
 </div>
 </div>
 </div>
 </div>

{/* Dev tools removed */}

 {isAdmin && false ? (
 <div className="mt-2 rounded-xl border border-[var(--border)] p-4">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <h3 className="text-sm font-medium">Admin review</h3>
 <p className="mt-1 text-xs text-[var(--muted)]">
 Manual approval/rejection stub for withdrawal requests.
 </p>
 </div>

 <button
 type="button"
 className="rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={loadingAction === "admin:load"}
 onClick={async () => {
 setLoadingAction("admin:load");
 setError(null);
 try {
 const json = await fetchJsonOrThrow<{ withdrawals: AdminWithdrawalRow[] }>(
"/api/exchange/admin/withdrawals?status=review",
 { cache:"no-store", headers: adminHeaders }
 );
 setAdminRequested(json.withdrawals ?? []);
 setToastKind("success");
 setToastMessage("Loaded requested withdrawals.");
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }}
 >
 Load requested
 </button>
 </div>

 <div className="mt-3 grid gap-2 md:grid-cols-2">
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">x-admin-key (optional)</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={adminKey}
 type="password"
 placeholder="EXCHANGE_ADMIN_KEY"
 onChange={(e) => setAdminKey(e.target.value)}
 />
 </label>
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">x-admin-id</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
 value={adminId}
 placeholder="admin@local"
 onChange={(e) => setAdminId(e.target.value)}
 />
 </label>
 </div>

 <div className="mt-3 grid gap-2">
 {adminRequested.length === 0 ? (
 <div className="text-xs text-[var(--muted)]">No requested withdrawals loaded.</div>
 ) : (
 adminRequested.map((w) => (
 <div
 key={w.id}
 className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2 text-xs"
 >
 <div className="min-w-0 flex-1">
 <div className="font-medium">
 {w.symbol} {w.amount} → <span className="truncate font-mono">{w.destination_address}</span>
 <span className="ml-2 rounded bg-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--foreground)]">
 {w.status}
 </span>
 </div>
 {typeof w.risk_score ==="number"? (
 <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
 <span className="text-[var(--muted)]">Risk</span>
 <span
 className={
"rounded px-2 py-0.5 font-mono"+
 (w.risk_score >= 85
 ?" bg-[var(--down-bg)] text-[var(--down)]"
 : w.risk_score >= 60
 ?" bg-[var(--warn-bg)] text-[var(--warn)]"
 : w.risk_score >= 25
 ?" bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]"
 :" bg-[var(--up-bg)] text-[var(--up)]")
 }
 title={w.risk_model_version ? `model ${w.risk_model_version}` :"risk signal"}
 >
 {w.risk_score}
 {w.risk_recommended_action ? ` • ${w.risk_recommended_action}` :""}
 </span>
 {w.risk_created_at ? (
 <span className="text-[var(--muted)]"title={w.risk_created_at}>
 {new Date(w.risk_created_at).toLocaleTimeString([], {
 hour:"2-digit",
 minute:"2-digit",
 })}
 </span>
 ) : null}
 </div>
 ) : (
 <div className="mt-1 text-[11px] text-[var(--muted)]">
 No risk signal yet (run <span className="font-mono">npm run outbox:worker:once</span>).
 </div>
 )}
 <div className="font-mono text-[11px] text-[var(--muted)]">
 {w.id} <span className="ml-2">user {w.user_id}</span>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={loadingAction === `admin:approve:${w.id}`}
 onClick={async () => {
 setLoadingAction(`admin:approve:${w.id}`);
 setError(null);
 try {
 await fetchJsonOrThrow(`/api/exchange/admin/withdrawals/${w.id}/approve`, {
 method:"POST",
 headers: {"content-type":"application/json", ...adminHeaders },
 body: JSON.stringify({ approved_by: adminId }),
 });
 setToastKind("success");
 setToastMessage("Approved.");
 setAdminRequested((prev) => prev.filter((x) => x.id !== w.id));
 await refreshAll();
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }}
 >
 Approve
 </button>

 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={loadingAction === `admin:reject:${w.id}`}
 onClick={async () => {
 setLoadingAction(`admin:reject:${w.id}`);
 setError(null);
 try {
 await fetchJsonOrThrow(`/api/exchange/admin/withdrawals/${w.id}/reject`, {
 method:"POST",
 headers: {"content-type":"application/json", ...adminHeaders },
 body: JSON.stringify({ reason:"manual_reject", rejected_by: adminId }),
 });
 setToastKind("success");
 setToastMessage("Rejected.");
 setAdminRequested((prev) => prev.filter((x) => x.id !== w.id));
 await refreshAll();
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }}
 >
 Reject
 </button>
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 ) : null}
 </div>
 </section>
 );
}
