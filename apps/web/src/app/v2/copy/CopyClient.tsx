"use client";

import { useEffect, useMemo, useState } from "react";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { V2Tabs } from "@/components/v2/Tabs";

type Leader = {
  id: string;
  user_id: string;
  display_name: string;
  bio: string | null;
  is_public: boolean;
  total_followers: number;
  total_pnl_pct: string;
  win_rate: string;
  created_at: string;
};

type Subscription = {
  id: string;
  follower_user_id: string;
  leader_id: string;
  leader_name: string;
  status: "active" | "paused" | "stopped";
  copy_ratio: string;
  max_per_trade: string | null;
  connection_id: string | null;
  created_at: string;
};

type LeadersResponse = { leaders: Leader[] } | { error: string };

type SubsResponse = { subscriptions: Subscription[] } | { error: string };

type SubscribeResponse = { subscription: Subscription } | { error: string; details?: any };

type PatchResponse = { subscription: Subscription } | { error: string; details?: any };

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

function fmtPct(raw: string | null | undefined): string {
  const n = toNum(raw);
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtRatio(raw: string | null | undefined): string {
  const n = toNum(raw);
  if (n == null) return "1.00";
  return n.toFixed(2);
}

export function CopyClient() {
  const [tab, setTab] = useState<"leaders" | "subs">("leaders");

  const [leadersLoading, setLeadersLoading] = useState(true);
  const [leadersError, setLeadersError] = useState<string | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);

  const [subsLoading, setSubsLoading] = useState(true);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);

  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [selectedLeader, setSelectedLeader] = useState<Leader | null>(null);
  const [copyRatio, setCopyRatio] = useState("1.00");
  const [maxPerTrade, setMaxPerTrade] = useState("");
  const [action, setAction] = useState<{ kind: "idle" | "working" | "error" | "ok"; message?: string }>({ kind: "idle" });

  const subsByLeaderId = useMemo(() => {
    const m = new Map<string, Subscription>();
    for (const s of subs) m.set(s.leader_id, s);
    return m;
  }, [subs]);

  const tabs = useMemo(() => {
    return [
      { id: "leaders", label: "Leaders" },
      { id: "subs", label: "My" },
    ];
  }, []);

  const loadLeaders = async (signal?: AbortSignal) => {
    setLeadersError(null);
    setLeadersLoading(true);
    try {
      const res = await fetch("/api/exchange/copy-trading/leaders", { cache: "no-store", signal });
      const json = (await res.json().catch(() => null)) as LeadersResponse | null;
      if (!res.ok) {
        const msg = (json as any)?.error;
        setLeaders([]);
        setLeadersError(typeof msg === "string" && msg.length ? msg : `Leaders unavailable (HTTP ${res.status}).`);
        return;
      }
      setLeaders(Array.isArray((json as any)?.leaders) ? ((json as any).leaders as Leader[]) : []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setLeaders([]);
      setLeadersError(e instanceof Error ? e.message : String(e));
    } finally {
      setLeadersLoading(false);
    }
  };

  const loadSubs = async (signal?: AbortSignal) => {
    setSubsError(null);
    setSubsLoading(true);
    try {
      const res = await fetch("/api/exchange/copy-trading/subscriptions", { cache: "no-store", credentials: "include", signal });
      const json = (await res.json().catch(() => null)) as SubsResponse | null;
      if (!res.ok) {
        // If not logged in, treat as empty without scary errors.
        if (res.status === 401) {
          setSubs([]);
          setSubsError(null);
          return;
        }
        const msg = (json as any)?.error;
        setSubs([]);
        setSubsError(typeof msg === "string" && msg.length ? msg : `Subscriptions unavailable (HTTP ${res.status}).`);
        return;
      }
      setSubs(Array.isArray((json as any)?.subscriptions) ? ((json as any).subscriptions as Subscription[]) : []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setSubs([]);
      setSubsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadLeaders(controller.signal);
    void loadSubs(controller.signal);
    return () => controller.abort();
  }, []);

  const openSubscribe = (leader: Leader) => {
    setSelectedLeader(leader);
    setCopyRatio("1.00");
    setMaxPerTrade("");
    setAction({ kind: "idle" });
    setSubscribeOpen(true);
  };

  const doSubscribe = async () => {
    if (!selectedLeader) return;

    setAction({ kind: "working" });
    try {
      const ratio = Number(copyRatio);
      const max = maxPerTrade.trim().length ? Number(maxPerTrade.trim()) : null;

      const body: any = { leaderId: selectedLeader.id };
      if (Number.isFinite(ratio) && ratio > 0) body.copyRatio = ratio;
      if (max != null && Number.isFinite(max) && max > 0) body.maxPerTrade = max;

      const res = await fetch("/api/exchange/copy-trading/subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as SubscribeResponse | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.error;
        setAction({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Subscribe failed (HTTP ${res.status}).` });
        return;
      }

      setAction({ kind: "ok", message: "Subscribed" });
      setSubscribeOpen(false);
      await loadSubs();
      await loadLeaders();
      setTab("subs");
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const patchSub = async (subscriptionId: string, updates: { status?: string }) => {
    setAction({ kind: "working" });
    try {
      const res = await fetch("/api/exchange/copy-trading/subscriptions", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscriptionId, ...updates }),
      });
      const json = (await res.json().catch(() => null)) as PatchResponse | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.error;
        setAction({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Update failed (HTTP ${res.status}).` });
        return;
      }
      setAction({ kind: "ok", message: "Updated" });
      await loadSubs();
      await loadLeaders();
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Copy trading</div>
        <div className="text-[15px] font-semibold text-[var(--v2-text)]">Follow leaders. Your trades mirror automatically.</div>
        <div className="text-[12px] text-[var(--v2-muted)]">You can pause or stop any time.</div>
      </header>

      <V2Tabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as any)} />

      {action.kind === "error" ? <div className="text-sm text-[var(--v2-down)]">{action.message ?? "Action failed."}</div> : null}
      {action.kind === "ok" ? <div className="text-sm text-[var(--v2-up)]">{action.message ?? "OK"}</div> : null}

      {tab === "leaders" ? (
        <V2Card>
          <V2CardHeader title="Leaders" subtitle="Public performance stats" />
          <V2CardBody>
            {leadersError ? <div className="text-sm text-[var(--v2-down)]">{leadersError}</div> : null}
            {leadersLoading ? (
              <div className="grid gap-2">
                <V2Skeleton className="h-16 w-full" />
                <V2Skeleton className="h-16 w-full" />
                <V2Skeleton className="h-16 w-full" />
              </div>
            ) : leaders.length ? (
              <div className="grid gap-2">
                {leaders.map((l) => {
                  const sub = subsByLeaderId.get(l.id) ?? null;
                  const pnl = fmtPct(l.total_pnl_pct);
                  const pnlNum = toNum(l.total_pnl_pct);
                  const pnlClass = pnlNum == null ? "text-[var(--v2-muted)]" : pnlNum >= 0 ? "text-[var(--v2-up)]" : "text-[var(--v2-down)]";

                  return (
                    <div key={l.id} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-extrabold text-[var(--v2-text)]">{l.display_name}</div>
                          {l.bio ? <div className="mt-0.5 line-clamp-2 text-[12px] text-[var(--v2-muted)]">{l.bio}</div> : null}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                            <span className={"font-semibold " + pnlClass}>PNL {pnl}</span>
                            <span className="text-[var(--v2-muted)]">Win {fmtPct(l.win_rate)}</span>
                            <span className="text-[var(--v2-muted)]">Followers {String(l.total_followers ?? 0)}</span>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {sub && sub.status !== "stopped" ? (
                            <V2Button variant={sub.status === "active" ? "primary" : "secondary"} size="sm" disabled>
                              {sub.status === "active" ? "Following" : "Paused"}
                            </V2Button>
                          ) : (
                            <V2Button variant="primary" size="sm" onClick={() => openSubscribe(l)}>
                              Follow
                            </V2Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--v2-muted)]">No public leaders yet.</div>
            )}
          </V2CardBody>
        </V2Card>
      ) : (
        <V2Card>
          <V2CardHeader title="My subscriptions" subtitle="Manage who you copy" />
          <V2CardBody>
            {subsError ? <div className="text-sm text-[var(--v2-down)]">{subsError}</div> : null}
            {subsLoading ? (
              <div className="grid gap-2">
                <V2Skeleton className="h-16 w-full" />
                <V2Skeleton className="h-16 w-full" />
              </div>
            ) : subs.length ? (
              <div className="grid gap-2">
                {subs.map((s) => {
                  const statusChip =
                    s.status === "active"
                      ? "bg-[var(--v2-up)] text-white"
                      : s.status === "paused"
                        ? "bg-[var(--v2-warn)] text-white"
                        : "bg-[var(--v2-surface)] text-[var(--v2-muted)] border border-[var(--v2-border)]";

                  return (
                    <div key={s.id} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-extrabold text-[var(--v2-text)]">{s.leader_name || "Leader"}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                            <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + statusChip}>{s.status}</span>
                            <span className="text-[var(--v2-muted)]">Ratio {fmtRatio(s.copy_ratio)}×</span>
                            {s.max_per_trade ? <span className="text-[var(--v2-muted)]">Max {s.max_per_trade}</span> : null}
                          </div>
                        </div>
                        <div className="shrink-0 grid gap-2">
                          {s.status === "active" ? (
                            <V2Button variant="secondary" size="xs" onClick={() => void patchSub(s.id, { status: "paused" })}>
                              Pause
                            </V2Button>
                          ) : s.status === "paused" ? (
                            <V2Button variant="primary" size="xs" onClick={() => void patchSub(s.id, { status: "active" })}>
                              Resume
                            </V2Button>
                          ) : null}
                          {s.status !== "stopped" ? (
                            <V2Button variant="danger" size="xs" onClick={() => void patchSub(s.id, { status: "stopped" })}>
                              Stop
                            </V2Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--v2-muted)]">No subscriptions yet.</div>
            )}
          </V2CardBody>
        </V2Card>
      )}

      <V2Sheet open={subscribeOpen} title="Follow leader" onClose={() => setSubscribeOpen(false)}>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
            <div className="text-[13px] font-semibold text-[var(--v2-text)]">{selectedLeader?.display_name ?? "Leader"}</div>
            {selectedLeader?.bio ? <div className="mt-1 text-[12px] text-[var(--v2-muted)]">{selectedLeader.bio}</div> : null}
          </div>

          <div className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Copy ratio</div>
            <V2Input inputMode="decimal" value={copyRatio} onChange={(e) => setCopyRatio(e.target.value)} placeholder="1.00" />
            <div className="text-[12px] text-[var(--v2-muted)]">Example: 0.50 copies half size. 2.00 doubles size.</div>
          </div>

          <div className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Max per trade (optional)</div>
            <V2Input inputMode="decimal" value={maxPerTrade} onChange={(e) => setMaxPerTrade(e.target.value)} placeholder="" />
            <div className="text-[12px] text-[var(--v2-muted)]">Caps the mirrored order size.</div>
          </div>

          <V2Button variant="primary" fullWidth disabled={action.kind === "working"} onClick={() => void doSubscribe()}>
            {action.kind === "working" ? "Following…" : "Follow"}
          </V2Button>
        </div>
      </V2Sheet>
    </main>
  );
}
