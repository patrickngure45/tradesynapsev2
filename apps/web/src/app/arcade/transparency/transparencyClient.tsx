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
  boost_consumption_7d: Array<{ day: string; code: string; count: number }>;
  crafting_7d: {
    items_salvaged: number;
    shards_spent: number;
    salvage_events: number;
    craft_events: number;
  };
};

function toneForRarity(rarity: string): { dot: string; bg: string; text: string } {
  const r = String(rarity ?? "").toLowerCase();
  if (r === "legendary") return { dot: "bg-[var(--warn)]", bg: "bg-[var(--warn-bg)]", text: "text-[var(--warn)]" };
  if (r === "epic") return { dot: "bg-[var(--accent-2)]", bg: "bg-[color-mix(in_srgb,var(--accent-2)_12%,transparent)]", text: "text-[var(--accent-2)]" };
  if (r === "rare") return { dot: "bg-[var(--accent)]", bg: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]", text: "text-[var(--accent)]" };
  return { dot: "bg-[var(--border)]", bg: "bg-[var(--card-2)]", text: "text-[var(--muted)]" };
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

  function distFor(key: "daily_drop" | "calendar_daily" | "time_vault" | "boost_draft") {
    const rows = (data as any)?.[key]?.distribution_all_time ?? [];
    const total = rows.reduce((acc: number, r: any) => acc + (Number.isFinite(r.count) ? r.count : 0), 0);
    return { rows: rows as Array<{ rarity: string; count: number }>, total };
  }

  const dailyDist = useMemo(() => distFor("daily_drop"), [data]);
  const calDist = useMemo(() => distFor("calendar_daily"), [data]);
  const vaultDist = useMemo(() => distFor("time_vault"), [data]);
  const draftDist = useMemo(() => distFor("boost_draft"), [data]);

  const boostSpend = useMemo(() => {
    const rows = data?.boost_consumption_7d ?? [];
    const byCode = new Map<string, number>();
    for (const r of rows) byCode.set(r.code, (byCode.get(r.code) ?? 0) + (Number(r.count) || 0));
    const list = Array.from(byCode.entries()).map(([code, count]) => ({ code, count }));
    list.sort((a, b) => b.count - a.count);
    return list.slice(0, 10);
  }, [data]);

  if (loading) {
    return (
      <div className="h-40 w-full animate-pulse rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_55%,transparent)]" />
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--warn-bg)] px-6 py-5 text-sm text-[var(--foreground)]">
        Error: <span className="font-semibold">{error}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center text-sm text-[var(--muted)]">
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
          <div key={x.k} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{x.k}</div>
            <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">{x.v}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{x.sub}</div>
          </div>
        ))}
      </section>

      {([
        { key: "daily_drop" as const, title: "Daily drop distribution", dist: dailyDist },
        { key: "calendar_daily" as const, title: "Calendar distribution", dist: calDist },
        { key: "time_vault" as const, title: "Time vault distribution", dist: vaultDist },
        { key: "boost_draft" as const, title: "Boost draft distribution", dist: draftDist },
      ] as const).map((s) => (
        <section key={s.key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{s.title}</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          {s.dist.total === 0 ? (
            <div className="mt-5 text-sm text-[var(--muted)]">No resolved actions yet.</div>
          ) : (
            <div className="mt-5 grid gap-3">
              {s.dist.rows.map((r) => {
                const pct = Math.round((r.count * 10_000) / Math.max(1, s.dist.total)) / 100;
                const tone = toneForRarity(r.rarity);
                return (
                  <div key={r.rarity} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden />
                        <div className="text-sm font-semibold text-[var(--foreground)]">{r.rarity}</div>
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {r.count} · {pct}%
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--card-2)]">
                      <div className={`h-full ${tone.bg}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
            <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
          </span>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Boosts spent (7d)</div>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {boostSpend.length === 0 ? (
          <div className="mt-5 text-sm text-[var(--muted)]">No boosts spent in the last 7 days.</div>
        ) : (
          <div className="mt-5 grid gap-2">
            {boostSpend.map((r) => (
              <div key={r.code} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                <div className="text-sm font-semibold text-[var(--foreground)]">{r.code}</div>
                <div className="text-xs font-bold text-[var(--muted)]">×{r.count}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
            <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
          </span>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Crafting activity (7d)</div>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Items salvaged</div>
            <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">{data.crafting_7d.items_salvaged}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">Across {data.crafting_7d.salvage_events} salvage events</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Shards spent</div>
            <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">{data.crafting_7d.shards_spent}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">Across {data.crafting_7d.craft_events} craft events</div>
          </div>
        </div>
      </section>
    </div>
  );
}
