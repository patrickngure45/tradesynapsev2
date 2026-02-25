"use client";

import { useEffect, useMemo, useState } from "react";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { V2Tabs } from "@/components/v2/Tabs";

type Product = {
  id: string;
  chain: string;
  kind: "flexible" | "locked";
  lock_days: number | null;
  apr_bps: number;
  status: "enabled" | "disabled";
  asset_id: string;
  asset_symbol: string;
  asset_name: string | null;
  asset_decimals: number;
};

type ProductsResp = { ok: true; products: Product[] } | { error: string; details?: any };

type Position = {
  id: string;
  status: string;
  kind: string;
  principal_amount: string;
  apr_bps: number;
  lock_days: number | null;
  started_at: string;
  ends_at: string | null;
  last_claim_at: string | null;
  hold_id: string | null;
  closed_at: string | null;
  product_id: string;
  asset_symbol: string;
  asset_decimals: number;
  claimable_interest: string;
  can_redeem: boolean;
};

type PositionsResp = { ok: true; positions: Position[] } | { error: string; details?: any };

type SubscribeResp = { ok: true; position_id: string } | { error: string; details?: any };

type ClaimResp = { ok: true; credited: string; asset: string } | { error: string; details?: any };

type RedeemResp = { ok: true } | { error: string; details?: any };

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

function fmtPctBps(bps: number | null | undefined): string {
  const n = typeof bps === "number" ? bps : Number(bps);
  if (!Number.isFinite(n)) return "—";
  return `${(n / 100).toFixed(2)}%`;
}

function fmtTs(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : s;
}

function fmtAmt(raw: string | null | undefined, maxDecimals = 8): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const parts = s.split(".");
  const intPart = parts[0] ?? "0";
  const frac = (parts[1] ?? "").replace(/0+$/, "");
  const clipped = frac.length > maxDecimals ? frac.slice(0, maxDecimals).replace(/0+$/, "") : frac;
  const intWith = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return clipped.length ? `${intWith}.${clipped}` : intWith;
}

export function EarnClient() {
  const [tab, setTab] = useState<"products" | "positions">("products");

  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [positionsLoading, setPositionsLoading] = useState(true);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [amount, setAmount] = useState("");
  const [totp, setTotp] = useState("");

  const [action, setAction] = useState<{ kind: "idle" | "working" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const tabs = useMemo(() => [
    { id: "products", label: "Products" },
    { id: "positions", label: "My" },
  ], []);

  const loadProducts = async (signal?: AbortSignal) => {
    setProductsError(null);
    setProductsLoading(true);
    try {
      const res = await fetch("/api/earn/products", { cache: "no-store", signal });
      const json = (await res.json().catch(() => null)) as ProductsResp | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setProducts([]);
        setProductsError(typeof msg === "string" && msg.length ? msg : `Products unavailable (HTTP ${res.status}).`);
        return;
      }
      setProducts(Array.isArray((json as any)?.products) ? ((json as any).products as Product[]) : []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setProducts([]);
      setProductsError(e instanceof Error ? e.message : String(e));
    } finally {
      setProductsLoading(false);
    }
  };

  const loadPositions = async (signal?: AbortSignal) => {
    setPositionsError(null);
    setPositionsLoading(true);
    try {
      const res = await fetch("/api/earn/positions", { cache: "no-store", credentials: "include", signal });
      const json = (await res.json().catch(() => null)) as PositionsResp | null;
      if (!res.ok) {
        if (res.status === 401) {
          setPositions([]);
          setPositionsError(null);
          return;
        }
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setPositions([]);
        setPositionsError(typeof msg === "string" && msg.length ? msg : `Positions unavailable (HTTP ${res.status}).`);
        return;
      }
      setPositions(Array.isArray((json as any)?.positions) ? ((json as any).positions as Position[]) : []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setPositions([]);
      setPositionsError(e instanceof Error ? e.message : String(e));
    } finally {
      setPositionsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadProducts(controller.signal);
    void loadPositions(controller.signal);
    return () => controller.abort();
  }, []);

  const openSubscribe = (p: Product) => {
    setSelectedProduct(p);
    setAmount("");
    setTotp("");
    setAction({ kind: "idle" });
    setSheetOpen(true);
  };

  const subscribe = async () => {
    if (!selectedProduct) return;
    setAction({ kind: "working" });
    try {
      const res = await fetch("/api/earn/positions/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product_id: selectedProduct.id, amount: amount.trim(), totp_code: totp.trim() || undefined }),
      });
      const json = (await res.json().catch(() => null)) as SubscribeResp | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setAction({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Subscribe failed (HTTP ${res.status}).` });
        return;
      }
      setAction({ kind: "ok", message: "Subscribed" });
      setSheetOpen(false);
      await loadPositions();
      setTab("positions");
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const claim = async (id: string) => {
    setAction({ kind: "working" });
    try {
      const res = await fetch(`/api/earn/positions/${encodeURIComponent(id)}/claim`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ totp_code: totp.trim() || undefined }),
      });
      const json = (await res.json().catch(() => null)) as ClaimResp | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setAction({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Claim failed (HTTP ${res.status}).` });
        return;
      }
      const credited = (json as any)?.credited;
      setAction({ kind: "ok", message: `Claimed ${fmtAmt(String(credited ?? "0"))}` });
      await loadPositions();
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const redeem = async (id: string) => {
    setAction({ kind: "working" });
    try {
      const res = await fetch(`/api/earn/positions/${encodeURIComponent(id)}/redeem`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ totp_code: totp.trim() || undefined }),
      });
      const json = (await res.json().catch(() => null)) as RedeemResp | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setAction({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Redeem failed (HTTP ${res.status}).` });
        return;
      }
      setAction({ kind: "ok", message: "Redeemed" });
      await loadPositions();
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Earn</div>
        <div className="text-[15px] font-semibold text-[var(--v2-text)]">Simple interest on locked balances</div>
        <div className="text-[12px] text-[var(--v2-muted)]">Principal is held (not transferable) while the position is active.</div>
      </header>

      <V2Tabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as any)} />

      {action.kind === "error" ? <div className="text-sm text-[var(--v2-down)]">{action.message ?? "Action failed."}</div> : null}
      {action.kind === "ok" ? <div className="text-sm text-[var(--v2-up)]">{action.message ?? "OK"}</div> : null}

      {tab === "products" ? (
        <V2Card>
          <V2CardHeader title="Products" subtitle="Flexible + locked" />
          <V2CardBody>
            {productsError ? <div className="text-sm text-[var(--v2-down)]">{productsError}</div> : null}
            {productsLoading ? (
              <div className="grid gap-2">
                <V2Skeleton className="h-16 w-full" />
                <V2Skeleton className="h-16 w-full" />
              </div>
            ) : products.length ? (
              <div className="grid gap-2">
                {products.map((p) => {
                  const apr = fmtPctBps(p.apr_bps);
                  return (
                    <div key={p.id} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[14px] font-extrabold text-[var(--v2-text)]">{p.asset_symbol} · {p.kind === "flexible" ? "Flexible" : `${p.lock_days}d Locked`}</div>
                          <div className="mt-1 text-[12px] text-[var(--v2-muted)]">APR {apr}</div>
                        </div>
                        <div className="shrink-0">
                          <V2Button variant="primary" size="sm" onClick={() => openSubscribe(p)}>
                            Subscribe
                          </V2Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--v2-muted)]">
                No earn products yet. (Dev: POST /api/earn/dev/seed-products)
              </div>
            )}
          </V2CardBody>
        </V2Card>
      ) : (
        <V2Card>
          <V2CardHeader title="My positions" subtitle="Claim interest or redeem" />
          <V2CardBody>
            {positionsError ? <div className="text-sm text-[var(--v2-down)]">{positionsError}</div> : null}
            {positionsLoading ? (
              <div className="grid gap-2">
                <V2Skeleton className="h-16 w-full" />
                <V2Skeleton className="h-16 w-full" />
              </div>
            ) : positions.length ? (
              <div className="grid gap-2">
                {positions.map((p) => {
                  const claimable = fmtAmt(p.claimable_interest);
                  const claimableNum = toNum(p.claimable_interest);
                  const canClaim = claimableNum != null && claimableNum > 0;
                  const canRedeem = Boolean(p.can_redeem);

                  const statusChip =
                    p.status === "active"
                      ? "bg-[var(--v2-up)] text-white"
                      : "bg-[var(--v2-surface)] text-[var(--v2-muted)] border border-[var(--v2-border)]";

                  return (
                    <div key={p.id} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[14px] font-extrabold text-[var(--v2-text)]">{p.asset_symbol} · {p.kind === "flexible" ? "Flexible" : `${p.lock_days}d Locked`}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                            <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + statusChip}>{p.status}</span>
                            <span className="text-[var(--v2-muted)]">Principal {fmtAmt(p.principal_amount)} {p.asset_symbol}</span>
                            <span className="text-[var(--v2-muted)]">APR {fmtPctBps(p.apr_bps)}</span>
                          </div>
                          <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Started {fmtTs(p.started_at)}{p.ends_at ? ` · Ends ${fmtTs(p.ends_at)}` : ""}</div>
                          <div className="mt-2 text-[13px] font-semibold text-[var(--v2-text)]">Claimable {claimable} {p.asset_symbol}</div>
                        </div>
                        <div className="shrink-0 grid gap-2">
                          <V2Button variant="secondary" size="xs" disabled={!canClaim || action.kind === "working"} onClick={() => void claim(p.id)}>
                            Claim
                          </V2Button>
                          <V2Button variant="danger" size="xs" disabled={!canRedeem || action.kind === "working"} onClick={() => void redeem(p.id)}>
                            Redeem
                          </V2Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--v2-muted)]">No earn positions yet.</div>
            )}

            <div className="mt-3 text-[12px] text-[var(--v2-muted)]">TOTP (if enabled) applies to subscribe/claim/redeem:</div>
            <div className="mt-1">
              <V2Input inputMode="numeric" placeholder="123456" value={totp} onChange={(e) => setTotp(e.target.value)} maxLength={6} />
            </div>
          </V2CardBody>
        </V2Card>
      )}

      <V2Sheet open={sheetOpen} title="Subscribe" onClose={() => setSheetOpen(false)}>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
            <div className="text-[14px] font-extrabold text-[var(--v2-text)]">
              {selectedProduct?.asset_symbol ?? "Asset"} · {selectedProduct?.kind === "flexible" ? "Flexible" : `${selectedProduct?.lock_days ?? 0}d Locked`}
            </div>
            <div className="mt-1 text-[12px] text-[var(--v2-muted)]">APR {fmtPctBps(selectedProduct?.apr_bps ?? 0)}</div>
          </div>

          <div className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Amount</div>
            <V2Input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">TOTP (if enabled)</div>
            <V2Input inputMode="numeric" placeholder="123456" value={totp} onChange={(e) => setTotp(e.target.value)} maxLength={6} />
          </div>

          <V2Button variant="primary" fullWidth disabled={action.kind === "working"} onClick={() => void subscribe()}>
            {action.kind === "working" ? "Subscribing…" : "Confirm"}
          </V2Button>
        </div>
      </V2Sheet>
    </main>
  );
}
