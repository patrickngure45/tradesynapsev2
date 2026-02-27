"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { V2Button, v2ButtonClassName } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";

type Plan = {
  id: string;
  status: "active" | "paused" | "canceled";
  from_symbol: string;
  to_symbol: string;
  amount_in: string;
  cadence: "daily" | "weekly";
  next_run_at: string | null;
  last_run_at: string | null;
  auth_expires_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  last_entry_id: string | null;
  created_at: string;
  updated_at: string;
};

type ListResp = { plans: Plan[]; limit: number } | { error: string; details?: any };

type CreateResp = { ok: true; id: string } | { error: string; details?: any };

type PatchResp = { ok: true } | { error: string; details?: any };

type AssetRow = { id: string; chain: string; symbol: string; name: string | null; decimals: number; is_enabled: boolean };

type AssetsResp = { assets: AssetRow[] } | { error: string };

function upperSym(v: string): string {
  return String(v ?? "").trim().toUpperCase();
}

function fmtTs(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : s;
}

export function DcaClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  const [assets, setAssets] = useState<AssetRow[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [fromSym, setFromSym] = useState("USDT");
  const [toSym, setToSym] = useState("BTC");
  const [amountIn, setAmountIn] = useState("10");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [firstRunInMin, setFirstRunInMin] = useState("5");
  const [totpCode, setTotpCode] = useState("");

  const [assetSheetOpen, setAssetSheetOpen] = useState(false);
  const [assetSheetKind, setAssetSheetKind] = useState<"from" | "to">("from");
  const [assetSearch, setAssetSearch] = useState("");

  const [action, setAction] = useState<{ kind: "idle" | "working" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const load = async (signal?: AbortSignal) => {
    setError(null);
    setLoading(true);
    try {
      const [plansRes, assetsRes] = await Promise.all([
        fetch("/api/exchange/recurring-buys?limit=100", { cache: "no-store", credentials: "include", signal }),
        fetch("/api/exchange/assets", { cache: "no-store", credentials: "include", signal }),
      ]);

      const plansJson = (await plansRes.json().catch(() => null)) as ListResp | null;
      const assetsJson = (await assetsRes.json().catch(() => null)) as AssetsResp | null;

      if (!plansRes.ok) {
        const msg = (plansJson as any)?.details?.message || (plansJson as any)?.message || (plansJson as any)?.error;
        throw new Error(typeof msg === "string" && msg.length ? msg : `Plans unavailable (HTTP ${plansRes.status}).`);
      }

      setPlans(Array.isArray((plansJson as any)?.plans) ? ((plansJson as any).plans as Plan[]) : []);

      if (assetsRes.ok) {
        const rows = Array.isArray((assetsJson as any)?.assets) ? ((assetsJson as any).assets as AssetRow[]) : [];
        const bsc = rows.filter((a) => String(a.chain).toLowerCase() === "bsc" && a.is_enabled);
        setAssets(bsc);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setPlans([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const filteredAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => {
      const sym = String(a.symbol ?? "").toLowerCase();
      const name = String(a.name ?? "").toLowerCase();
      return sym.includes(q) || name.includes(q);
    });
  }, [assets, assetSearch]);

  const openAssetSheet = (kind: "from" | "to") => {
    setAssetSheetKind(kind);
    setAssetSearch("");
    setAssetSheetOpen(true);
  };

  const pickAsset = (sym: string) => {
    const s = upperSym(sym);
    if (!s) return;
    if (assetSheetKind === "from") {
      setFromSym(s);
      if (upperSym(toSym) === s) {
        const alt = assets.find((a) => upperSym(a.symbol) !== s);
        if (alt) setToSym(upperSym(alt.symbol));
      }
    } else {
      setToSym(s);
      if (upperSym(fromSym) === s) {
        const alt = assets.find((a) => upperSym(a.symbol) !== s);
        if (alt) setFromSym(upperSym(alt.symbol));
      }
    }
    setAssetSheetOpen(false);
  };

  const createPlan = async () => {
    setAction({ kind: "working" });
    try {
      const body = {
        from_symbol: upperSym(fromSym),
        to_symbol: upperSym(toSym),
        amount_in: String(amountIn ?? "").trim(),
        cadence,
        first_run_in_min: Number(firstRunInMin),
        totp_code: totpCode.trim() || undefined,
      };

      const res = await fetch("/api/exchange/recurring-buys", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as CreateResp | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setAction({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Create failed (HTTP ${res.status}).` });
        return;
      }

      setAction({ kind: "ok", message: "Plan created" });
      setCreateOpen(false);
      setTotpCode("");
      await load();
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const patchPlan = async (id: string, status: "active" | "paused" | "canceled") => {
    setAction({ kind: "working" });
    try {
      const res = await fetch("/api/exchange/recurring-buys", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status, totp_code: totpCode.trim() || undefined }),
      });
      const json = (await res.json().catch(() => null)) as PatchResp | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setAction({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Update failed (HTTP ${res.status}).` });
        return;
      }

      setAction({ kind: "ok", message: "Updated" });
      await load();
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">DCA</div>
            <div className="text-[15px] font-semibold text-[var(--v2-text)]">Recurring buys (Auto‑Invest)</div>
            <div className="text-[12px] text-[var(--v2-muted)]">Runs on a timer and uses Convert under the hood.</div>
          </div>
          <V2Button variant="primary" size="sm" onClick={() => { setAction({ kind: "idle" }); setCreateOpen(true); }}>
            New
          </V2Button>
        </div>
      </header>

      {action.kind === "error" ? <div className="text-sm text-[var(--v2-down)]">{action.message ?? "Action failed."}</div> : null}
      {action.kind === "ok" ? <div className="text-sm text-[var(--v2-up)]">{action.message ?? "OK"}</div> : null}

      <V2Card>
        <V2CardHeader title="Plans" subtitle="Your scheduled buys" />
        <V2CardBody>
          {error ? <div className="text-sm text-[var(--v2-down)]">{error}</div> : null}
          {loading ? (
            <div className="grid gap-2">
              <V2Skeleton className="h-16 w-full" />
              <V2Skeleton className="h-16 w-full" />
            </div>
          ) : plans.length ? (
            <div className="grid gap-2">
              {plans.map((p) => {
                const statusChip =
                  p.status === "active"
                    ? "bg-[var(--v2-up)] text-white"
                    : p.status === "paused"
                      ? "bg-[var(--v2-warn)] text-white"
                      : "bg-[var(--v2-surface)] text-[var(--v2-muted)] border border-[var(--v2-border)]";

                return (
                  <div key={p.id} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-extrabold text-[var(--v2-text)]">
                          {p.amount_in} {upperSym(p.from_symbol)} → {upperSym(p.to_symbol)}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                          <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + statusChip}>{p.status}</span>
                          <span className="text-[var(--v2-muted)]">{p.cadence}</span>
                          <span className="text-[var(--v2-muted)]">Next {fmtTs(p.next_run_at)}</span>
                        </div>
                        {p.last_run_status || p.last_run_error ? (
                          <div className="mt-1 text-[12px] text-[var(--v2-muted)]">
                            Last: {String(p.last_run_status ?? "—")} {p.last_run_error ? `· ${p.last_run_error}` : ""}
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0 grid gap-2">
                        {p.status === "active" ? (
                          <V2Button variant="secondary" size="xs" onClick={() => void patchPlan(p.id, "paused")}>Pause</V2Button>
                        ) : p.status === "paused" ? (
                          <V2Button variant="primary" size="xs" onClick={() => void patchPlan(p.id, "active")}>Resume</V2Button>
                        ) : null}
                        {p.status !== "canceled" ? (
                          <V2Button variant="danger" size="xs" onClick={() => void patchPlan(p.id, "canceled")}>Cancel</V2Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[12px] text-[var(--v2-muted)]">No DCA plans yet.</div>
          )}

          <div className="mt-3 text-[12px] text-[var(--v2-muted)]">
            Tip: if you don’t have enough balance, top up in <Link href="/v2/wallet" className="underline">Wallet</Link>.
          </div>
        </V2CardBody>
      </V2Card>

      <V2Sheet open={createOpen} title="New recurring buy" onClose={() => setCreateOpen(false)}>
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => openAssetSheet("from")}
            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-left text-[14px] font-semibold text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)] hover:bg-[var(--v2-surface-2)]"
          >
            From: {upperSym(fromSym)}
          </button>

          <button
            type="button"
            onClick={() => openAssetSheet("to")}
            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-left text-[14px] font-semibold text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)] hover:bg-[var(--v2-surface-2)]"
          >
            To: {upperSym(toSym)}
          </button>

          <div className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Amount (in FROM asset)</div>
            <V2Input inputMode="decimal" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} placeholder="10" />
          </div>

          <div className="grid gap-2">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Cadence</div>
            <div className="grid grid-cols-2 gap-2">
              <V2Button variant={cadence === "daily" ? "primary" : "secondary"} fullWidth onClick={() => setCadence("daily")}>Daily</V2Button>
              <V2Button variant={cadence === "weekly" ? "primary" : "secondary"} fullWidth onClick={() => setCadence("weekly")}>Weekly</V2Button>
            </div>
          </div>

          <div className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">First run (minutes from now)</div>
            <V2Input inputMode="numeric" value={firstRunInMin} onChange={(e) => setFirstRunInMin(e.target.value)} placeholder="5" />
          </div>

          <div className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">TOTP (if enabled)</div>
            <V2Input inputMode="numeric" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456" />
          </div>

          <V2Button variant="primary" fullWidth disabled={action.kind === "working"} onClick={() => void createPlan()}>
            {action.kind === "working" ? "Creating…" : "Create"}
          </V2Button>

          <div className="text-[12px] text-[var(--v2-muted)]">
            Plans execute via cron/worker. If you want immediate execution, use <Link href="/v2/convert" className={v2ButtonClassName({ variant: "ghost", size: "xs" })}>Convert</Link>.
          </div>
        </div>
      </V2Sheet>

      <V2Sheet open={assetSheetOpen} title={assetSheetKind === "from" ? "From asset" : "To asset"} onClose={() => setAssetSheetOpen(false)}>
        <div className="grid gap-2">
          <V2Input placeholder="Search" value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} />
          <div className="grid gap-1">
            {filteredAssets.map((a) => {
              const sym = upperSym(a.symbol);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickAsset(sym)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-left shadow-[var(--v2-shadow-sm)] hover:bg-[var(--v2-surface-2)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-[var(--v2-text)]">{sym}</div>
                    <div className="truncate text-[12px] text-[var(--v2-muted)]">{a.name ?? ""}</div>
                  </div>
                </button>
              );
            })}
            {filteredAssets.length === 0 ? <div className="text-sm text-[var(--v2-muted)]">No assets found.</div> : null}
          </div>
        </div>
      </V2Sheet>
    </main>
  );
}
