"use client";

import { useEffect, useState, useCallback } from "react";

type OnChainBalance = {
  asset: string;
  balance: string;
  contract?: string;
};

type DepositInfo = {
  address: string;
  chain: string;
  balances: OnChainBalance[];
};

export function OnChainWalletPanel() {
  const [info, setInfo] = useState<DepositInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAddress = useCallback(async () => {
    setLoading(true);
    try {
      const userId = localStorage.getItem("ts_user_id") ?? "";
      const res = await fetch("/api/exchange/deposit-address", {
        credentials: "include",
        headers: userId ? { "x-user-id": userId } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to get deposit address");
      }
      const data = await res.json();

      // Map API response to Component state
      setInfo({
        address: data.address,
        chain: data.chain ?? "bsc",
        balances: (data.on_chain_balances || []).map((b: any) => ({
             asset: b.symbol,
             balance: b.balance,
             contract: b.contractAddress
        })),
      });
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAddress();
  }, [fetchAddress]);

  const copyAddress = async () => {
    if (!info?.address) return;
    await navigator.clipboard.writeText(info.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">BSC On-Chain Wallet</h3>
        <button
          onClick={fetchAddress}
          disabled={loading}
          className="rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {info && (
        <div className="space-y-4">
          {/* Deposit address */}
          <div>
            <div className="mb-1 text-xs text-[var(--muted)]">Deposit Address (BNB Smart Chain)</div>
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 overflow-hidden text-ellipsis rounded bg-[var(--background)] px-3 py-2 font-mono text-xs">
                {info.address}
              </code>
              <button
                onClick={copyAddress}
                className="shrink-0 rounded border border-[var(--border)] px-3 py-2 text-xs transition hover:bg-[var(--accent)]/10"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted)]">
              Only send BEP-20 tokens (BSC) to this address. Sending tokens on other chains will result in permanent loss.
            </p>
          </div>

          {/* On-Chain balances */}
          <div>
            <div className="mb-2 text-xs text-[var(--muted)]">On-Chain Balance</div>
            {info.balances.length === 0 ? (
              <div className="text-xs text-[var(--muted)]">No on-chain balances found</div>
            ) : (
              <div className="space-y-2">
                {info.balances.map((b) => (
                  <div key={b.asset} className="rounded bg-[var(--background)] px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{b.asset.toUpperCase()}</span>
                      <span className="font-mono text-sm">{Number(b.balance).toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!info && !loading && !error && (
        <div className="text-sm text-[var(--muted)]">
          Click Refresh to generate your deposit address.
        </div>
      )}
    </div>
  );
}
