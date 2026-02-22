"use client";

import Link from "next/link";
import { startAuthentication } from "@simplewebauthn/browser";
import { useEffect, useMemo, useState } from "react";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import { ApiErrorBanner, type ClientApiError } from "@/components/ApiErrorBanner";
import { Toast, type ToastKind } from "@/components/Toast";
import { buttonClassName } from "@/components/ui/Button";
import { formatTokenAmount } from "@/lib/format/amount";

type Asset = {
  id: string;
  chain: string;
  symbol: string;
  name: string | null;
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

type AllowlistRow = {
  id: string;
  chain: string;
  address: string;
  label: string | null;
  status: string;
  created_at: string;
};

type ProfileResponse = {
  user?: {
    email_verified: boolean;
    totp_enabled: boolean;
    kyc_level: string;
  };
};

type GasQuote = {
  enabled: boolean;
  gasSymbol: string;
  amount: string;
  chargeSymbol?: string;
  chargeAmount?: string;
  mode: "static" | "realtime";
  burnBps: number;
  details?: Record<string, unknown>;
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
  reference: string | null;
  tx_hash: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

type ExplainWithdrawalResponse = {
  ok: true;
  kind: "withdrawal";
  id: string;
  status: string;
  state: string;
  summary: string;
  blockers: string[];
  next_steps: string[];
  ai?: unknown;
};

type ArcadeInventoryResponse = {
  ok: true;
  shards: number;
  items: Array<{ kind: string; code: string; rarity: string; quantity: number; metadata_json?: any }>;
};

function withDevUserHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const uid = localStorage.getItem("ts_user_id") ?? localStorage.getItem("pp_user_id");
    if (uid && !headers.has("x-user-id")) headers.set("x-user-id", uid);
  }
  return { ...init, headers, credentials: init?.credentials ?? "same-origin" };
}

function digits6(v: string): string {
  return v.replace(/\D/g, "").slice(0, 6);
}

function toClientApiError(e: unknown): ClientApiError {
  if (e instanceof ApiError) return { code: e.code, details: e.details };
  return { code: "network_error", details: String(e) };
}

export function WithdrawClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ClientApiError | null>(null);

  const [passkeySupported, setPasskeySupported] = useState(false);
  const [confirmingPasskey, setConfirmingPasskey] = useState(false);

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [allowlist, setAllowlist] = useState<AllowlistRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);

  const [openExplainWithdrawalId, setOpenExplainWithdrawalId] = useState<string | null>(null);
  const [explainByWithdrawalId, setExplainByWithdrawalId] = useState<
    Record<string, { summary: string; blockers: string[]; next_steps: string[] } | null>
  >({});
  const [explainErrorByWithdrawalId, setExplainErrorByWithdrawalId] = useState<Record<string, string | null>>({});

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<ToastKind>("info");

  const [withdrawAssetId, setWithdrawAssetId] = useState<string>("");
  const [withdrawAllowlistId, setWithdrawAllowlistId] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [withdrawReference, setWithdrawReference] = useState<string>("");
  const [withdrawTotpCode, setWithdrawTotpCode] = useState<string>("");
  const [withdrawing, setWithdrawing] = useState(false);

  const [feeBoostEligible, setFeeBoostEligible] = useState(false);
  const [useFeeBoost, setUseFeeBoost] = useState(false);
  const [bestFeeBoostLabel, setBestFeeBoostLabel] = useState<string | null>(null);

  const [priorityBoostEligible, setPriorityBoostEligible] = useState(false);
  const [usePriorityBoost, setUsePriorityBoost] = useState(false);
  const [bestPriorityBoostLabel, setBestPriorityBoostLabel] = useState<string | null>(null);

  const [gasQuote, setGasQuote] = useState<GasQuote | null>(null);
  const [gasQuoteLoading, setGasQuoteLoading] = useState(false);

  const [newAddr, setNewAddr] = useState<string>("");
  const [newLabel, setNewLabel] = useState<string>("");
  const [newAddrTotpCode, setNewAddrTotpCode] = useState<string>("");
  const [addingAddr, setAddingAddr] = useState(false);

  useEffect(() => {
    setPasskeySupported(typeof window !== "undefined" && typeof PublicKeyCredential !== "undefined");
  }, []);

  const assetById = useMemo(() => {
    const out = new Map<string, Asset>();
    for (const a of assets) out.set(a.id, a);
    return out;
  }, [assets]);

  const selectedAsset = useMemo(() => (withdrawAssetId ? assetById.get(withdrawAssetId) ?? null : null), [withdrawAssetId, assetById]);

  const selectedBalance = useMemo(() => {
    if (!withdrawAssetId) return null;
    return balances.find((b) => b.asset_id === withdrawAssetId) ?? null;
  }, [balances, withdrawAssetId]);

  const chainAllowlist = useMemo(() => {
    const chain = selectedAsset?.chain ?? "bsc";
    return allowlist.filter((a) => a.chain === chain && a.status === "active");
  }, [allowlist, selectedAsset?.chain]);

  const selectedAllowlist = useMemo(() => {
    if (!withdrawAllowlistId) return null;
    return allowlist.find((a) => a.id === withdrawAllowlistId) ?? null;
  }, [allowlist, withdrawAllowlistId]);

  const emailVerified = !!profile?.user?.email_verified;
  const totpEnabled = !!profile?.user?.totp_enabled;

  const confirmPasskeyStepUp = async () => {
    if (!passkeySupported) throw new Error("Passkeys aren’t supported in this browser/device.");

    setConfirmingPasskey(true);
    try {
      type StartAuthOptions = Parameters<typeof startAuthentication>[0];

      const opt = await fetchJsonOrThrow<{ options: StartAuthOptions }>(
        "/api/account/passkeys/authenticate/options",
        withDevUserHeader({ method: "POST", cache: "no-store" }),
      );

      const assertion = await startAuthentication(opt.options);

      await fetchJsonOrThrow<{ ok?: boolean }>(
        "/api/account/passkeys/authenticate/verify",
        withDevUserHeader({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response: assertion }),
        }),
      );

      setToastKind("success");
      setToastMessage("Passkey confirmed (valid for a few minutes)." );
    } finally {
      setConfirmingPasskey(false);
    }
  };

  const runWithOptionalStepUp = async <T,>(op: () => Promise<T>): Promise<T> => {
    try {
      return await op();
    } catch (e) {
      if (e instanceof ApiError && e.code === "stepup_required") {
        await confirmPasskeyStepUp();
        return await op();
      }
      throw e;
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    setError(null);

    try {
      const [a, b, w, p, wd] = await Promise.all([
        fetchJsonOrThrow<{ assets?: Asset[] }>("/api/exchange/assets", withDevUserHeader({ cache: "no-store" })),
        fetchJsonOrThrow<{ balances?: BalanceRow[] }>("/api/exchange/balances", withDevUserHeader({ cache: "no-store" })),
        fetchJsonOrThrow<{ addresses?: AllowlistRow[] }>(
          "/api/exchange/withdrawals/allowlist",
          withDevUserHeader({ cache: "no-store" }),
        ),
        fetchJsonOrThrow<ProfileResponse>("/api/account/profile", withDevUserHeader({ cache: "no-store" })),
        fetchJsonOrThrow<{ withdrawals?: WithdrawalRow[] }>(
          "/api/exchange/withdrawals",
          withDevUserHeader({ cache: "no-store" }),
        ),
      ]);

      try {
        const inv = await fetchJsonOrThrow<ArcadeInventoryResponse>("/api/arcade/inventory", withDevUserHeader({ cache: "no-store" }));
        const items = Array.isArray(inv.items) ? inv.items : [];
        const feeBoosts = items.filter((i) => i.kind === "boost" && /^fee_\d+bps_/i.test(String(i.code ?? "")) && Number(i.quantity ?? 0) > 0);
        const eligible = feeBoosts.length > 0;
        setFeeBoostEligible(eligible);
        if (!eligible) {
          setUseFeeBoost(false);
          setBestFeeBoostLabel(null);
        } else {
          const best = feeBoosts
            .slice()
            .sort((x, y) => {
              const bx = Number(String(x.code).match(/fee_(\d+)bps/i)?.[1] ?? 0);
              const by = Number(String(y.code).match(/fee_(\d+)bps/i)?.[1] ?? 0);
              return by - bx;
            })[0];
          const label = String(best?.metadata_json?.label ?? best?.code ?? "Fee boost");
          setBestFeeBoostLabel(label);
        }

        const priBoosts = items.filter(
          (i) => i.kind === "boost" && (i.code === "withdraw_priority_72h" || i.code === "withdraw_priority_12h") && Number(i.quantity ?? 0) > 0,
        );
        const priEligible = priBoosts.length > 0;
        setPriorityBoostEligible(priEligible);
        if (!priEligible) {
          setUsePriorityBoost(false);
          setBestPriorityBoostLabel(null);
        } else {
          const best = priBoosts
            .slice()
            .sort((x, y) => {
              const hx = Number(String(x.code).match(/priority_(\d+)h/i)?.[1] ?? 0);
              const hy = Number(String(y.code).match(/priority_(\d+)h/i)?.[1] ?? 0);
              return hy - hx;
            })[0];
          const label = String(best?.metadata_json?.label ?? best?.code ?? "Priority boost");
          setBestPriorityBoostLabel(label);
        }
      } catch {
        setFeeBoostEligible(false);
        setUseFeeBoost(false);
        setBestFeeBoostLabel(null);

        setPriorityBoostEligible(false);
        setUsePriorityBoost(false);
        setBestPriorityBoostLabel(null);
      }

      const nextAssets = Array.isArray(a.assets) ? a.assets : [];
      const nextBalances = Array.isArray(b.balances) ? b.balances : [];
      const nextAllowlist = Array.isArray(w.addresses) ? w.addresses : [];

      setAssets(nextAssets);
      setBalances(nextBalances);
      setAllowlist(nextAllowlist);
      setProfile(p ?? null);
      setWithdrawals(Array.isArray(wd.withdrawals) ? wd.withdrawals : []);

      if (!withdrawAssetId) {
        const firstWithBalance = nextBalances.find((row) => Number(row.available) > 0);
        if (firstWithBalance?.asset_id) setWithdrawAssetId(firstWithBalance.asset_id);
        else if (nextAssets.length > 0) setWithdrawAssetId(nextAssets[0]!.id);
      }

      if (!withdrawAllowlistId) {
        const chain = selectedAsset?.chain ?? "bsc";
        const activeOnChain = nextAllowlist.filter((x) => x.chain === chain && x.status === "active");
        if (activeOnChain.length > 0) setWithdrawAllowlistId(activeOnChain[0]!.id);
      }
    } catch (e) {
      setError(toClientApiError(e));
    } finally {
      setLoading(false);
    }
  };

  const loadExplainWithdrawal = async (id: string) => {
    if (Object.prototype.hasOwnProperty.call(explainByWithdrawalId, id)) return;
    setExplainErrorByWithdrawalId((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await fetchJsonOrThrow<ExplainWithdrawalResponse>(
        `/api/explain/withdrawal?id=${encodeURIComponent(id)}`,
        withDevUserHeader({ cache: "no-store" }),
      );
      setExplainByWithdrawalId((prev) => ({
        ...prev,
        [id]: {
          summary: String(res.summary ?? ""),
          blockers: Array.isArray(res.blockers) ? res.blockers.map((x) => String(x)) : [],
          next_steps: Array.isArray(res.next_steps) ? res.next_steps.map((x) => String(x)) : [],
        },
      }));
    } catch (e) {
      setExplainByWithdrawalId((prev) => ({ ...prev, [id]: null }));
      setExplainErrorByWithdrawalId((prev) => ({
        ...prev,
        [id]: e instanceof ApiError ? e.code : e instanceof Error ? e.message : "Network error",
      }));
    }
  };

  const handleCancel = async (id: string) => {
    setError(null);
    setToastMessage(null);
    try {
      await fetchJsonOrThrow<{ ok?: boolean; withdrawal_id?: string }>(
        `/api/exchange/withdrawals/${encodeURIComponent(id)}/cancel`,
        withDevUserHeader({ method: "POST" }),
      );
      setToastKind("success");
      setToastMessage("Withdrawal canceled." );
      await refreshAll();
    } catch (e) {
      setError(toClientApiError(e));
    }
  };

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedAsset) {
      setGasQuote(null);
      setGasQuoteLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setGasQuoteLoading(true);
        try {
          const qs = new URLSearchParams({
            action: "withdrawal_request",
            chain: selectedAsset.chain,
            asset_symbol: selectedAsset.symbol,
          });
          const json = await fetchJsonOrThrow<{ quote: GasQuote }>(
            `/api/exchange/gas/quote?${qs.toString()}`,
            withDevUserHeader({ cache: "no-store" }),
          );
          if (!cancelled) setGasQuote(json.quote ?? null);
        } catch {
          if (!cancelled) setGasQuote(null);
        } finally {
          if (!cancelled) setGasQuoteLoading(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedAsset]);

  const handleAddAllowlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setToastMessage(null);

    const address = newAddr.trim();
    if (!address) return;

    setAddingAddr(true);
    try {
      await runWithOptionalStepUp(() =>
        fetchJsonOrThrow<{ address?: AllowlistRow }>(
          "/api/exchange/withdrawals/allowlist",
          withDevUserHeader({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chain: "bsc",
              address,
              ...(newLabel.trim() ? { label: newLabel.trim() } : {}),
              ...(digits6(newAddrTotpCode).length === 6 ? { totp_code: digits6(newAddrTotpCode) } : {}),
            }),
          }),
        ),
      );

      setToastKind("success");
      setToastMessage("Address added to allowlist." );
      setNewAddr("");
      setNewLabel("");
      setNewAddrTotpCode("");
      await refreshAll();
    } catch (e2) {
      setError(toClientApiError(e2));
    } finally {
      setAddingAddr(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setToastMessage(null);

    const asset = selectedAsset;
    if (!asset) {
      setError({ code: "invalid_input", details: { message: "Select an asset" } });
      return;
    }

    const dest = selectedAllowlist?.address ?? "";
    if (!dest) {
      setError({ code: "invalid_input", details: { message: "Select a withdrawal address" } });
      return;
    }

    const amount = withdrawAmount.trim();
    if (!amount) {
      setError({ code: "invalid_input", details: { message: "Enter an amount" } });
      return;
    }

    setWithdrawing(true);
    try {
      await runWithOptionalStepUp(() =>
        fetchJsonOrThrow<unknown>(
          "/api/exchange/withdrawals/request",
          withDevUserHeader({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              asset_id: asset.id,
              amount,
              destination_address: dest,
              ...(withdrawReference.trim() ? { reference: withdrawReference.trim() } : {}),
              ...(digits6(withdrawTotpCode).length === 6 ? { totp_code: digits6(withdrawTotpCode) } : {}),
              ...(feeBoostEligible ? { use_fee_boost: Boolean(useFeeBoost) } : {}),
              ...(priorityBoostEligible ? { use_priority_boost: Boolean(usePriorityBoost) } : {}),
            }),
          }),
        ),
      );

      setToastKind("success");
      setToastMessage("Withdrawal requested." );
      setWithdrawAmount("");
      setWithdrawReference("");
      setWithdrawTotpCode("");
      await refreshAll();
    } catch (e2) {
      setError(toClientApiError(e2));
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Withdraw</h1>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Withdrawals are allowlist-only and require strong authentication.
          </div>
        </div>
        <Link href="/wallet" className={buttonClassName({ variant: "secondary", size: "sm" })}>
          Back
        </Link>
      </div>

      {loading ? (
        <div className="rounded border border-[var(--border)] bg-[var(--card)]/25 p-4 text-sm text-[var(--muted)]">Loading…</div>
      ) : null}

      {!loading && !emailVerified ? (
        <div className="rounded border border-[color-mix(in_srgb,var(--warn)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] p-4 text-sm">
          <div className="font-semibold">Email verification required</div>
          <div className="mt-1 text-[var(--muted)]">Verify your email before withdrawing or adding addresses.</div>
          <div className="mt-3">
            <Link href="/account" className={buttonClassName({ variant: "primary", size: "sm" })}>
              Go to Account
            </Link>
          </div>
        </div>
      ) : null}

      <ApiErrorBanner error={error} onRetry={loading ? undefined : () => void refreshAll()} />

      <section className="rounded border border-[var(--border)] bg-[var(--card)]/25 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-extrabold">Withdrawal Address Allowlist</div>
            <div className="mt-1 text-xs text-[var(--muted)]">Only allowlisted addresses can be used.</div>
          </div>
          <button
            type="button"
            className={buttonClassName({ variant: "secondary", size: "xs" })}
            onClick={() => void refreshAll()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          {allowlist.length === 0 ? (
            <div className="text-sm text-[var(--muted)]">No allowlisted addresses yet.</div>
          ) : (
            allowlist.slice(0, 8).map((a) => (
              <div key={a.id} className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{a.label || a.address}</div>
                    <div className="mt-1 text-xs font-mono text-[var(--muted)] break-all">
                      {a.chain}:{a.address}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--muted)]">{a.status}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddAllowlist} className="mt-4 rounded border border-[var(--border)] bg-[var(--bg)] p-3">
          <div className="text-sm font-semibold">Add address</div>
          <div className="mt-2 grid gap-2">
            <input
              value={newAddr}
              onChange={(e) => setNewAddr(e.target.value)}
              placeholder="0x… (BSC)"
              className="w-full rounded border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-full rounded border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
            />
            {totpEnabled ? (
              <input
                value={newAddrTotpCode}
                onChange={(e) => setNewAddrTotpCode(digits6(e.target.value))}
                placeholder="2FA code (if prompted)"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full rounded border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className={buttonClassName({ variant: "primary", size: "sm" })}
                disabled={addingAddr || !emailVerified}
              >
                {addingAddr ? "Adding…" : "Add"}
              </button>

              <button
                type="button"
                className={buttonClassName({ variant: "secondary", size: "sm" })}
                onClick={() => void confirmPasskeyStepUp().catch((e) => setError(toClientApiError(e)))}
                disabled={!passkeySupported || confirmingPasskey || !emailVerified}
                title={!passkeySupported ? "Passkeys not supported" : ""}
              >
                {confirmingPasskey ? "Confirming…" : "Confirm passkey"}
              </button>

              <div className="text-xs text-[var(--muted)]">New addresses may require a cooldown before use.</div>
            </div>
          </div>
        </form>
      </section>

      <section className="rounded border border-[var(--border)] bg-[var(--card)]/25 p-4">
        <div className="text-sm font-extrabold">Request withdrawal</div>
        <form onSubmit={handleWithdraw} className="mt-3 grid gap-3">
          <label className="grid gap-1">
            <div className="text-xs font-semibold text-[var(--muted)]">Asset</div>
            <select
              value={withdrawAssetId}
              onChange={(e) => {
                setWithdrawAssetId(e.target.value);
                setWithdrawAllowlistId("");
              }}
              className="w-full rounded border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
            >
              <option value="">Select asset</option>
              {assets
                .filter((a) => a.chain === "bsc")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol}
                  </option>
                ))}
            </select>
            {selectedBalance ? (
              <div className="text-[11px] text-[var(--muted)]">
                Available: {formatTokenAmount(selectedBalance.available, selectedBalance.decimals)} {selectedBalance.symbol}
              </div>
            ) : null}
          </label>

          <label className="grid gap-1">
            <div className="text-xs font-semibold text-[var(--muted)]">Destination</div>
            <select
              value={withdrawAllowlistId}
              onChange={(e) => setWithdrawAllowlistId(e.target.value)}
              className="w-full rounded border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
            >
              <option value="">Select allowlisted address</option>
              {chainAllowlist.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.label ? a.label + " — " : "") + a.address.slice(0, 10) + "…" + a.address.slice(-6)}
                </option>
              ))}
            </select>
            {selectedAllowlist ? (
              <div className="text-[11px] font-mono text-[var(--muted)] break-all">{selectedAllowlist.address}</div>
            ) : null}
          </label>

          <label className="grid gap-1">
            <div className="text-xs font-semibold text-[var(--muted)]">Amount</div>
            <input
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder={selectedAsset ? `0.0 ${selectedAsset.symbol}` : "0.0"}
              className="w-full rounded border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
              inputMode="decimal"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>

          <label className="grid gap-1">
            <div className="text-xs font-semibold text-[var(--muted)]">Reference (optional)</div>
            <input
              value={withdrawReference}
              onChange={(e) => setWithdrawReference(e.target.value)}
              placeholder="Notes for support / internal reference"
              className="w-full rounded border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
            />
          </label>

          {totpEnabled ? (
            <label className="grid gap-1">
              <div className="text-xs font-semibold text-[var(--muted)]">2FA code (if prompted)</div>
              <input
                value={withdrawTotpCode}
                onChange={(e) => setWithdrawTotpCode(digits6(e.target.value))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full rounded border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
              />
            </label>
          ) : null}

          <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-xs font-semibold text-[var(--muted)]">Network fee</div>
            <div className="mt-1 text-sm">
              {gasQuoteLoading ? (
                <span className="text-[var(--muted)]">Fetching fee…</span>
              ) : gasQuote && gasQuote.enabled ? (
                <span>
                  {gasQuote.chargeAmount ?? gasQuote.amount} {gasQuote.chargeSymbol ?? gasQuote.gasSymbol}
                </span>
              ) : (
                <span className="text-[var(--muted)]">Unavailable</span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">You may be asked to confirm with passkey or 2FA.</div>
          </div>

          {feeBoostEligible ? (
            <label className="flex items-start gap-3 rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
              <input
                type="checkbox"
                checked={useFeeBoost}
                onChange={(e) => setUseFeeBoost(e.target.checked)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block font-semibold">Use fee discount boost</span>
                <span className="block text-[11px] text-[var(--muted)]">Consumes 1 boost{bestFeeBoostLabel ? ` (${bestFeeBoostLabel})` : ""}.</span>
              </span>
            </label>
          ) : null}

          {priorityBoostEligible ? (
            <label className="flex items-start gap-3 rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
              <input
                type="checkbox"
                checked={usePriorityBoost}
                onChange={(e) => setUsePriorityBoost(e.target.checked)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block font-semibold">Use withdrawal priority boost</span>
                <span className="block text-[11px] text-[var(--muted)]">Consumes 1 boost{bestPriorityBoostLabel ? ` (${bestPriorityBoostLabel})` : ""}.</span>
              </span>
            </label>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className={buttonClassName({ variant: "primary", size: "md" })}
              disabled={withdrawing || !emailVerified}
            >
              {withdrawing ? "Requesting…" : "Request withdrawal"}
            </button>
            <button
              type="button"
              className={buttonClassName({ variant: "secondary", size: "md" })}
              onClick={() => void confirmPasskeyStepUp().catch((e) => setError(toClientApiError(e)))}
              disabled={!passkeySupported || confirmingPasskey || !emailVerified}
              title={!passkeySupported ? "Passkeys not supported" : ""}
            >
              {confirmingPasskey ? "Confirming…" : "Confirm passkey"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded border border-[var(--border)] bg-[var(--card)]/25 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-extrabold">Recent withdrawals</div>
            <div className="mt-1 text-xs text-[var(--muted)]">Latest 10 requests</div>
          </div>
          <button
            type="button"
            className={buttonClassName({ variant: "secondary", size: "xs" })}
            onClick={() => void refreshAll()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          {withdrawals.length === 0 ? (
            <div className="text-sm text-[var(--muted)]">No withdrawals yet.</div>
          ) : (
            withdrawals.slice(0, 10).map((w) => (
              <div key={w.id} className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {w.amount} {w.symbol}
                    </div>
                    <div className="mt-1 text-[11px] font-mono text-[var(--muted)] break-all">
                      to {w.destination_address}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--muted)]">
                      {new Date(w.created_at).toLocaleString()} — {w.status}
                      {w.tx_hash ? " — tx: " + w.tx_hash.slice(0, 12) + "…" : ""}
                    </div>
                    {w.failure_reason ? (
                      <div className="mt-1 text-[11px] text-[var(--muted)]">Reason: {w.failure_reason}</div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      className={buttonClassName({ variant: "secondary", size: "xs" })}
                      onClick={() => {
                        const next = openExplainWithdrawalId === w.id ? null : w.id;
                        setOpenExplainWithdrawalId(next);
                        if (next) void loadExplainWithdrawal(w.id);
                      }}
                      disabled={loading}
                    >
                      {openExplainWithdrawalId === w.id ? "Hide" : "Explain"}
                    </button>

                    {w.status === "requested" ? (
                      <button
                        type="button"
                        className={buttonClassName({ variant: "danger", size: "xs" })}
                        onClick={() => void handleCancel(w.id)}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>

                {openExplainWithdrawalId === w.id ? (
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--card)]/25 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Status explanation</div>

                    {explainErrorByWithdrawalId[w.id] ? (
                      <div className="mt-2 text-xs text-[var(--muted)]">Unable to load explanation: {explainErrorByWithdrawalId[w.id]}</div>
                    ) : explainByWithdrawalId[w.id] ? (
                      <div className="mt-2 grid gap-3">
                        <div className="text-sm font-semibold text-[var(--foreground)]">{explainByWithdrawalId[w.id]!.summary}</div>

                        {explainByWithdrawalId[w.id]!.blockers.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Blockers</div>
                            <ul className="mt-2 list-disc pl-5 text-xs text-[var(--muted)]">
                              {explainByWithdrawalId[w.id]!.blockers.map((b, i) => (
                                <li key={i}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {explainByWithdrawalId[w.id]!.next_steps.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Next steps</div>
                            <ul className="mt-2 list-disc pl-5 text-xs text-[var(--muted)]">
                              {explainByWithdrawalId[w.id]!.next_steps.slice(0, 4).map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-[var(--muted)]">Loading…</div>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <Toast message={toastMessage} kind={toastKind} onDone={() => setToastMessage(null)} />
    </div>
  );
}
