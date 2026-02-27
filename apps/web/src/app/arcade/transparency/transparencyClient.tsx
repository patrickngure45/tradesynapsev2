"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";

type TransparencyResponse = {
  ok: true;
  counts: {
    actions_total: number;
    actions_resolved: number;
    inventory_rows: number;
    inventory_quantity: number;
  };
  daily_drop: {
    distribution_all_time: Array<{ rarity: string; count: number }>;
    distribution_7d: Array<{ day: string; rarity: string; count: number }>;
  };
  calendar_daily: {
    distribution_all_time: Array<{ rarity: string; count: number }>;
    distribution_7d: Array<{ day: string; rarity: string; count: number }>;
  };
  time_vault: {
    distribution_all_time: Array<{ rarity: string; count: number }>;
    distribution_7d: Array<{ day: string; rarity: string; count: number }>;
  };
  boost_draft: {
    distribution_all_time: Array<{ rarity: string; count: number }>;
    distribution_7d: Array<{ day: string; rarity: string; count: number }>;
  };
  ai_oracle: {
    distribution_all_time: Array<{ rarity: string; count: number }>;
    distribution_7d: Array<{ day: string; rarity: string; count: number }>;
  };
  latency_7d: Array<{ module: string; n: number; p50_s: number; p95_s: number; avg_s: number }>;
  overdue: Array<{ module: string; count: number }>;
  boost_consumption_7d: Array<{ day: string; code: string; count: number }>;
  crafting_7d: {
    items_salvaged: number;
    shards_spent: number;
    salvage_events: number;
    craft_events: number;
  };
};

function fmtSeconds(s: number) {
  if (!Number.isFinite(s) || s <= 0) return "0s";
  if (s < 1) return `${Math.round(s * 1000)}ms`;
  if (s < 60) return `${Math.round(s * 10) / 10}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  const mm = m - h * 60;
  return `${h}h ${mm}m`;
}

function toneForRarity(rarity: string): { dot: string; bg: string; text: string } {
  const r = String(rarity ?? "").toLowerCase();
  if (r === "legendary") return { dot: "bg-[var(--v2-warn)]", bg: "bg-[var(--v2-warn-bg)]", text: "text-[var(--v2-warn)]" };
  if (r === "epic") return { dot: "bg-[var(--v2-accent-2)]", bg: "bg-[color-mix(in_srgb,var(--v2-accent-2)_12%,transparent)]", text: "text-[var(--v2-accent-2)]" };
  if (r === "rare") return { dot: "bg-[var(--v2-accent)]", bg: "bg-[color-mix(in_srgb,var(--v2-accent)_10%,transparent)]", text: "text-[var(--v2-accent)]" };
  return { dot: "bg-[var(--v2-border)]", bg: "bg-[var(--v2-surface-2)]", text: "text-[var(--v2-muted)]" };
}

export function ArcadeTransparencyClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TransparencyResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchJsonOrThrow<TransparencyResponse>("/api/arcade/transparency", { cache: "no-store" });
        if (!cancelled) setData(res);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError) setError(e.code);
        else setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function distFor(key: "daily_drop" | "calendar_daily" | "time_vault" | "boost_draft" | "ai_oracle") {
    const rows = (data as any)?.[key]?.distribution_all_time ?? [];
    const total = rows.reduce((acc: number, r: any) => acc + (Number.isFinite(r.count) ? r.count : 0), 0);
    return { rows: rows as Array<{ rarity: string; count: number }>, total };
  }

  const dailyDist = useMemo(() => distFor("daily_drop"), [data]);
  const calDist = useMemo(() => distFor("calendar_daily"), [data]);
  const vaultDist = useMemo(() => distFor("time_vault"), [data]);
  const draftDist = useMemo(() => distFor("boost_draft"), [data]);
  const oracleDist = useMemo(() => distFor("ai_oracle"), [data]);

  const boostSpend = useMemo(() => {
    const rows = data?.boost_consumption_7d ?? [];
    const byCode = new Map<string, number>();
    for (const r of rows) byCode.set(r.code, (byCode.get(r.code) ?? 0) + (Number(r.count) || 0));
    const list = Array.from(byCode.entries()).map(([code, count]) => ({ code, count }));
    list.sort((a, b) => b.count - a.count);
    return list.slice(0, 10);
  }, [data]);

  const latency = useMemo(() => {
    const rows = data?.latency_7d ?? [];
    const list = rows
      .map((r) => ({
        module: r.module,
        n: Number(r.n) || 0,
        p50_s: Number(r.p50_s) || 0,
        p95_s: Number(r.p95_s) || 0,
        avg_s: Number(r.avg_s) || 0,
      }))
      .filter((r) => r.n > 0);
    list.sort((a, b) => b.p95_s - a.p95_s);
    return list;
  }, [data]);

  const overdue = useMemo(() => {
    const rows = data?.overdue ?? [];
    const list = rows.map((r) => ({ module: r.module, count: Number(r.count) || 0 })).filter((r) => r.count > 0);
    list.sort((a, b) => b.count - a.count);
    return list;
  }, [data]);

  if (loading) {
    return (
      <div className="h-40 w-full animate-pulse rounded-3xl border border-[var(--v2-border)] bg-[color-mix(in_srgb,var(--v2-surface)_55%,transparent)]" />
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-warn-bg)] px-6 py-5 text-sm text-[var(--v2-text)]">
        Error: <span className="font-semibold">{error}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-6 py-10 text-center text-sm text-[var(--v2-muted)]">
        No data yet.
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-4">
        {[{
          k: "Actions",
          v: data.counts.actions_total,
          sub: "Total commits",
        }, {
          k: "Resolved",
          v: data.counts.actions_resolved,
          sub: "Reveals completed",
        }, {
          k: "Inventory",
          v: data.counts.inventory_quantity,
          sub: "Total items",
        }, {
          k: "Stacks",
          v: data.counts.inventory_rows,
          sub: "Unique items",
        }].map((x) => (
          <div key={x.k} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4 shadow-[var(--v2-shadow-sm)]">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">{x.k}</div>
            <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--v2-text)]">{x.v}</div>
            <div className="mt-1 text-xs text-[var(--v2-muted)]">{x.sub}</div>
          </div>
        ))}
      </section>

      {([
        { key: "daily_drop" as const, title: "Daily drop distribution", dist: dailyDist },
        { key: "calendar_daily" as const, title: "Calendar distribution", dist: calDist },
        { key: "time_vault" as const, title: "Time vault distribution", dist: vaultDist },
        { key: "boost_draft" as const, title: "Boost draft distribution", dist: draftDist },
        { key: "ai_oracle" as const, title: "AI Oracle tier distribution", dist: oracleDist },
      ] as const).map((s) => (
        <section key={s.key} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-5 shadow-[var(--v2-shadow-sm)]">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--v2-accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--v2-ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">{s.title}</div>
            <div className="h-px flex-1 bg-[var(--v2-border)]" />
          </div>

          {s.dist.total === 0 ? (
            <div className="mt-5 text-sm text-[var(--v2-muted)]">No resolved actions yet.</div>
          ) : (
            <div className="mt-5 grid gap-3">
              {s.dist.rows.map((r) => {
                const pct = Math.round((r.count * 10_000) / Math.max(1, s.dist.total)) / 100;
                const tone = toneForRarity(r.rarity);
                return (
                  <div key={r.rarity} className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-bg)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden />
                        <div className="text-sm font-semibold text-[var(--v2-text)]">{r.rarity}</div>
                      </div>
                      <div className="text-xs text-[var(--v2-muted)]">
                        {r.count} · {pct}%
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--v2-surface-2)]">
                      <div className={`h-full ${tone.bg}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}

      <section className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-5 shadow-[var(--v2-shadow-sm)]">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--v2-accent)]" />
            <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--v2-ring)]" />
          </span>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Resolution latency (7d)</div>
          <div className="h-px flex-1 bg-[var(--v2-border)]" />
        </div>

        {latency.length === 0 ? (
          <div className="mt-5 text-sm text-[var(--v2-muted)]">No resolved actions in the last 7 days.</div>
        ) : (
          <div className="mt-5 grid gap-2">
            {latency.map((r) => (
              <div key={r.module} className="grid gap-2 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-bg)] p-4 md:grid-cols-4">
                <div>
                  <div className="text-xs font-semibold text-[var(--v2-text)]">{r.module}</div>
                  <div className="mt-1 text-xs text-[var(--v2-muted)]">n={r.n}</div>
                </div>
                <div className="text-xs text-[var(--v2-muted)]">
                  <span className="font-semibold text-[var(--v2-text)]">p50</span> {fmtSeconds(r.p50_s)}
                </div>
                <div className="text-xs text-[var(--v2-muted)]">
                  <span className="font-semibold text-[var(--v2-text)]">p95</span> {fmtSeconds(r.p95_s)}
                </div>
                <div className="text-xs text-[var(--v2-muted)]">
                  <span className="font-semibold text-[var(--v2-text)]">avg</span> {fmtSeconds(r.avg_s)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-5 shadow-[var(--v2-shadow-sm)]">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--v2-warn)]" />
            <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--v2-ring)]" />
          </span>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Overdue actions</div>
          <div className="h-px flex-1 bg-[var(--v2-border)]" />
        </div>

        {overdue.length === 0 ? (
          <div className="mt-5 text-sm text-[var(--v2-muted)]">No overdue actions right now.</div>
        ) : (
          <div className="mt-5 grid gap-2">
            {overdue.map((r) => (
              <div key={r.module} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-bg)] px-4 py-3">
                <div className="text-sm font-semibold text-[var(--v2-text)]">{r.module}</div>
                <div className="text-xs font-bold text-[var(--v2-muted)]">×{r.count}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-5 shadow-[var(--v2-shadow-sm)]">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--v2-accent-2)]" />
            <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--v2-ring)]" />
          </span>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Boosts spent (7d)</div>
          <div className="h-px flex-1 bg-[var(--v2-border)]" />
        </div>

        {boostSpend.length === 0 ? (
          <div className="mt-5 text-sm text-[var(--v2-muted)]">No boosts spent in the last 7 days.</div>
        ) : (
          <div className="mt-5 grid gap-2">
            {boostSpend.map((r) => (
              <div key={r.code} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-bg)] px-4 py-3">
                <div className="text-sm font-semibold text-[var(--v2-text)]">{r.code}</div>
                <div className="text-xs font-bold text-[var(--v2-muted)]">×{r.count}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-5 shadow-[var(--v2-shadow-sm)]">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--v2-accent)]" />
            <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--v2-ring)]" />
          </span>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Crafting activity (7d)</div>
          <div className="h-px flex-1 bg-[var(--v2-border)]" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-bg)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Items salvaged</div>
            <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--v2-text)]">{data.crafting_7d.items_salvaged}</div>
            <div className="mt-1 text-xs text-[var(--v2-muted)]">Across {data.crafting_7d.salvage_events} salvage events</div>
          </div>
          <div className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-bg)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Shards spent</div>
            <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--v2-text)]">{data.crafting_7d.shards_spent}</div>
            <div className="mt-1 text-xs text-[var(--v2-muted)]">Across {data.crafting_7d.craft_events} craft events</div>
          </div>
        </div>
      </section>
    </div>
  );
}
