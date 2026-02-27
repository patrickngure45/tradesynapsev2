"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";

type EarnProduct = {
  id: string;
  chain: string;
  asset_id: string;
  asset_symbol: string;
  asset_name: string | null;
  asset_decimals: number;
  kind: "flexible" | "locked";
  lock_days: number | null;
  apr_bps: number;
  status: "enabled" | "disabled";
  created_at: string;
  updated_at: string;
};

type ListResponse = { ok: true; products: EarnProduct[] };
type CreateResponse = { ok: true; product: EarnProduct };
type PatchResponse = { ok: true; product: EarnProduct };
type FundTreasuryResponse = { ok: true; entry_id: string; created_at: string };

type OpsTreasuryRow = {
  asset_id: string;
  asset_symbol: string;
  asset_decimals: number;
  treasury_posted: string;
  treasury_held: string;
  treasury_available: string;
  accrued_interest: string;
  deficit: string;
};

type OpsPayoutRow = {
  entry_id: string;
  created_at: string;
  user_id: string | null;
  position_id: string | null;
  asset: string | null;
  amount: string | null;
  tx_hash: string | null;
  block_height: number | null;
};

type OpsSummaryResponse = {
  ok: true;
  treasury: OpsTreasuryRow[];
  recent_payouts: OpsPayoutRow[];
  coverage_ok: boolean;
};

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match?.[1] ?? null;
}

async function adminFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const mergedInit: RequestInit = { ...(init ?? {}), credentials: "include" };

  const method = String(mergedInit.method ?? "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      const headers = new Headers(mergedInit.headers);
      if (!headers.has("x-csrf-token")) headers.set("x-csrf-token", csrf);
      mergedInit.headers = headers;
    }
  }

  const res = await fetch(path, mergedInit);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }

  const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const err = obj && typeof obj.error === "string" ? obj.error : null;
  if (!res.ok) throw new Error(err ?? `http_${res.status}`);
  return json as T;
}

function fmtApr(aprBps: number): string {
  const pct = aprBps / 100;
  return `${pct.toFixed(2)}%`;
}

export function EarnProductsAdminClient() {
  const [products, setProducts] = useState<EarnProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [treasuryAssetSymbol, setTreasuryAssetSymbol] = useState("USDT");
  const [treasuryAmount, setTreasuryAmount] = useState("10");
  const [treasuryFunding, setTreasuryFunding] = useState(false);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);

  const [opsLoading, setOpsLoading] = useState(true);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [ops, setOps] = useState<OpsSummaryResponse | null>(null);

  const [newAssetSymbol, setNewAssetSymbol] = useState("USDT");
  const [newKind, setNewKind] = useState<"flexible" | "locked">("flexible");
  const [newLockDays, setNewLockDays] = useState("30");
  const [newAprBps, setNewAprBps] = useState("500");

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const sym = a.asset_symbol.localeCompare(b.asset_symbol);
      if (sym !== 0) return sym;
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return (a.lock_days ?? 0) - (b.lock_days ?? 0);
    });
  }, [products]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch<ListResponse>("/api/exchange/admin/earn/products", { cache: "no-store" });
      setProducts(res.products);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "load_failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOps = useCallback(async () => {
    setOpsLoading(true);
    setOpsError(null);
    try {
      const res = await adminFetch<OpsSummaryResponse>("/api/exchange/admin/earn/ops/summary", { cache: "no-store" });
      setOps(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ops_load_failed";
      setOpsError(msg);
    } finally {
      setOpsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOps();
  }, [loadOps]);

  const patchProduct = useCallback(
    async (id: string, patch: { apr_bps?: number; status?: "enabled" | "disabled" }) => {
      setSavingId(id);
      setError(null);
      try {
        const res = await adminFetch<PatchResponse>(`/api/exchange/admin/earn/products/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        setProducts((prev) => prev.map((p) => (p.id === id ? res.product : p)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "save_failed";
        setError(msg);
      } finally {
        setSavingId(null);
      }
    },
    [],
  );

  const createProduct = useCallback(async () => {
    setCreating(true);
    setCreateError(null);

    const asset_symbol = newAssetSymbol.trim();
    const kind = newKind;
    const lock_days = kind === "locked" ? Number(newLockDays) : null;
    const apr_bps = Number(newAprBps);

    if (!asset_symbol) {
      setCreateError("asset_required");
      setCreating(false);
      return;
    }
    if (!Number.isFinite(apr_bps) || apr_bps < 0) {
      setCreateError("invalid_apr_bps");
      setCreating(false);
      return;
    }
    if (kind === "locked") {
      if (lock_days == null || !Number.isFinite(lock_days) || lock_days < 1) {
        setCreateError("invalid_lock_days");
        setCreating(false);
        return;
      }
    }

    try {
      const res = await adminFetch<CreateResponse>("/api/exchange/admin/earn/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          asset_symbol,
          kind,
          lock_days,
          apr_bps,
          status: "enabled",
        }),
      });

      setProducts((prev) => [res.product, ...prev]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "create_failed";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }, [newAprBps, newAssetSymbol, newKind, newLockDays]);

  const fundTreasury = useCallback(async () => {
    setTreasuryFunding(true);
    setTreasuryError(null);

    const asset_symbol = treasuryAssetSymbol.trim();
    const amount = treasuryAmount.trim();
    if (!asset_symbol || !amount) {
      setTreasuryError("invalid_input");
      setTreasuryFunding(false);
      return;
    }

    try {
      await adminFetch<FundTreasuryResponse>("/api/exchange/admin/earn/treasury/fund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asset_symbol, amount }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fund_failed";
      setTreasuryError(msg);
    } finally {
      setTreasuryFunding(false);
    }
  }, [treasuryAmount, treasuryAssetSymbol]);

  const fundTreasuryQuick = useCallback(async (asset_symbol: string, amount: string) => {
    setTreasuryFunding(true);
    setTreasuryError(null);
    try {
      await adminFetch<FundTreasuryResponse>("/api/exchange/admin/earn/treasury/fund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asset_symbol, amount }),
      });
      await loadOps();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fund_failed";
      setTreasuryError(msg);
    } finally {
      setTreasuryFunding(false);
    }
  }, [loadOps]);

  return (
    <div className="space-y-4">
      <V2Card>
        <V2CardHeader
          title="Earn Ops Summary"
          subtitle="Treasury balances, projected accrued interest, and recent payouts."
        />
        <V2CardBody>
          {opsLoading ? <div className="text-sm text-[var(--v2-muted)]">Loading…</div> : null}
          {opsError ? <div className="text-sm font-semibold text-[var(--v2-down)]">{opsError}</div> : null}

          {ops && !ops.coverage_ok ? (
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              Treasury coverage warning: projected accrued interest exceeds treasury available for one or more assets.
            </div>
          ) : null}

          {ops ? (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">Treasury Coverage</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Asset</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Available</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Accrued</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Deficit</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Status</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ops.treasury.map((r) => {
                        const deficit = Number(r.deficit);
                        const low = Number.isFinite(deficit) && deficit > 0;
                        const canFund = low && !treasuryFunding;
                        return (
                          <tr key={r.asset_id} className="text-sm text-[var(--v2-text)]">
                            <td className="border-b border-[var(--v2-border)] px-2 py-2 font-semibold">{r.asset_symbol}</td>
                            <td className="border-b border-[var(--v2-border)] px-2 py-2">{r.treasury_available}</td>
                            <td className="border-b border-[var(--v2-border)] px-2 py-2">{r.accrued_interest}</td>
                            <td className="border-b border-[var(--v2-border)] px-2 py-2">{r.deficit}</td>
                            <td className="border-b border-[var(--v2-border)] px-2 py-2">
                              <span
                                className={
                                  low
                                    ? "inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-200"
                                    : "inline-flex rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-200"
                                }
                              >
                                {low ? "LOW" : "OK"}
                              </span>
                            </td>
                            <td className="border-b border-[var(--v2-border)] px-2 py-2">
                              {low ? (
                                <V2Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={!canFund}
                                  onClick={() => fundTreasuryQuick(r.asset_symbol, r.deficit)}
                                >
                                  {treasuryFunding ? "Funding…" : "Fund deficit"}
                                </V2Button>
                              ) : (
                                <span className="text-xs text-[var(--v2-muted)]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">Recent Interest Payouts</div>
                {ops.recent_payouts.length === 0 ? (
                  <div className="text-sm text-[var(--v2-muted)]">No payouts yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">
                          <th className="border-b border-[var(--v2-border)] px-2 py-2">Time</th>
                          <th className="border-b border-[var(--v2-border)] px-2 py-2">Asset</th>
                          <th className="border-b border-[var(--v2-border)] px-2 py-2">Amount</th>
                          <th className="border-b border-[var(--v2-border)] px-2 py-2">Tx</th>
                          <th className="border-b border-[var(--v2-border)] px-2 py-2">Position</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ops.recent_payouts.map((p) => {
                          const txShort = p.tx_hash ? `${p.tx_hash.slice(0, 10)}…` : "—";
                          const posShort = p.position_id ? `${p.position_id.slice(0, 8)}…` : "—";
                          return (
                            <tr key={p.entry_id} className="text-sm text-[var(--v2-text)]">
                              <td className="border-b border-[var(--v2-border)] px-2 py-2 text-xs text-[var(--v2-muted)]">{p.created_at}</td>
                              <td className="border-b border-[var(--v2-border)] px-2 py-2 font-semibold">{p.asset ?? "—"}</td>
                              <td className="border-b border-[var(--v2-border)] px-2 py-2">{p.amount ?? "—"}</td>
                              <td className="border-b border-[var(--v2-border)] px-2 py-2 text-xs text-[var(--v2-muted)]">{txShort}</td>
                              <td className="border-b border-[var(--v2-border)] px-2 py-2 text-xs text-[var(--v2-muted)]">{posShort}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end">
            <V2Button variant="ghost" size="sm" onClick={loadOps} disabled={opsLoading}>
              Refresh
            </V2Button>
          </div>
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Treasury Funding" subtitle="Transfers funds from your admin balance into the Earn treasury (used for interest payouts)." />
        <V2CardBody>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Asset Symbol</div>
              <V2Input value={treasuryAssetSymbol} onChange={(e) => setTreasuryAssetSymbol(e.target.value)} placeholder="USDT" />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Amount</div>
              <V2Input value={treasuryAmount} onChange={(e) => setTreasuryAmount(e.target.value)} placeholder="10" inputMode="decimal" />
            </div>
            <div className="flex items-end justify-end">
              <div className="flex items-center gap-2">
                {treasuryError ? <div className="text-xs font-semibold text-[var(--v2-down)]">{treasuryError}</div> : null}
                <V2Button variant="secondary" onClick={fundTreasury} disabled={treasuryFunding}>
                  {treasuryFunding ? "Funding…" : "Fund Treasury"}
                </V2Button>
              </div>
            </div>
          </div>
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Create Product" subtitle="Adds a new Earn product for an asset." />
        <V2CardBody>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-1">
              <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Asset Symbol</div>
              <V2Input value={newAssetSymbol} onChange={(e) => setNewAssetSymbol(e.target.value)} placeholder="USDT" />
            </div>

            <div className="md:col-span-1">
              <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Kind</div>
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as "flexible" | "locked")}
                className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
              >
                <option value="flexible">Flexible</option>
                <option value="locked">Locked</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Lock Days</div>
              <V2Input
                value={newLockDays}
                onChange={(e) => setNewLockDays(e.target.value)}
                placeholder="30"
                disabled={newKind !== "locked"}
                inputMode="numeric"
              />
            </div>

            <div className="md:col-span-1">
              <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">APR (bps)</div>
              <V2Input value={newAprBps} onChange={(e) => setNewAprBps(e.target.value)} placeholder="500" inputMode="numeric" />
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-[var(--v2-muted)]">Example: 500 bps = 5.00% APR</div>
            <div className="flex items-center gap-2">
              {createError ? <div className="text-xs font-semibold text-[var(--v2-down)]">{createError}</div> : null}
              <V2Button variant="primary" onClick={createProduct} disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </V2Button>
            </div>
          </div>
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Products" subtitle="Edits apply immediately to the Earn UI." />
        <V2CardBody>
          {loading ? <div className="text-sm text-[var(--v2-muted)]">Loading…</div> : null}
          {error ? <div className="text-sm font-semibold text-[var(--v2-down)]">{error}</div> : null}

          {!loading && sortedProducts.length === 0 ? (
            <div className="text-sm text-[var(--v2-muted)]">No products yet.</div>
          ) : null}

          {sortedProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Asset</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Type</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">APR</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Status</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProducts.map((p) => {
                    const isSaving = savingId === p.id;
                    return (
                      <tr key={p.id} className="text-sm text-[var(--v2-text)]">
                        <td className="border-b border-[var(--v2-border)] px-2 py-2">
                          <div className="font-semibold">{p.asset_symbol}</div>
                          <div className="text-xs text-[var(--v2-muted)]">{p.asset_name ?? p.chain.toUpperCase()}</div>
                        </td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2">
                          <div className="font-semibold">{p.kind === "flexible" ? "Flexible" : "Locked"}</div>
                          <div className="text-xs text-[var(--v2-muted)]">{p.kind === "locked" ? `${p.lock_days ?? "?"} days` : "—"}</div>
                        </td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2">
                          <div className="flex items-center gap-2">
                            <V2Input
                              value={String(p.apr_bps)}
                              onChange={(e) => {
                                const next = e.target.value;
                                setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, apr_bps: Number(next || 0) } : x)));
                              }}
                              inputMode="numeric"
                            />
                            <div className="text-xs text-[var(--v2-muted)]">{fmtApr(p.apr_bps)}</div>
                          </div>
                        </td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2">
                          <span
                            className={
                              p.status === "enabled"
                                ? "inline-flex rounded-full bg-emerald-900/20 px-2 py-0.5 text-xs font-semibold text-emerald-300"
                                : "inline-flex rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-300"
                            }
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <V2Button
                              size="sm"
                              variant="secondary"
                              disabled={isSaving}
                              onClick={() => patchProduct(p.id, { apr_bps: p.apr_bps })}
                            >
                              {isSaving ? "Saving…" : "Save APR"}
                            </V2Button>
                            <V2Button
                              size="sm"
                              variant={p.status === "enabled" ? "secondary" : "primary"}
                              disabled={isSaving}
                              onClick={() => patchProduct(p.id, { status: p.status === "enabled" ? "disabled" : "enabled" })}
                            >
                              {p.status === "enabled" ? "Disable" : "Enable"}
                            </V2Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end">
            <V2Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              Refresh
            </V2Button>
          </div>
        </V2CardBody>
      </V2Card>
    </div>
  );
}
