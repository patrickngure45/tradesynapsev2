"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJsonOrThrow } from "@/lib/api/client";

type StatusPayload = {
  ok: boolean;
  overall: "online" | "degraded" | "offline";
  db?: { ok?: boolean; latency_ms?: number | null };
  outbox?: { open?: number; dead?: number; with_errors?: number };
  expected_services?: Array<{ service: string; staleAfterMs: number }>;
  stale_expected_services?: string[];
  heartbeats?: Array<{ service: string; status: string; last_seen_at: string }>;
  took_ms?: number;
};

function Badge({ text, variant }: { text: string; variant: "green" | "red" | "amber" | "gray" }) {
  const cls =
    variant === "green"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
      : variant === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
        : variant === "red"
          ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
          : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.18em] ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {text}
    </span>
  );
}

export function StatusClient() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchJsonOrThrow<StatusPayload>("/api/status", { cache: "no-store" });
      setData(d);
    } catch (e: any) {
      setData(null);
      setErr(e?.message ? String(e.message) : "status_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const overallBadge = useMemo(() => {
    const o = data?.overall ?? "offline";
    if (o === "online") return <Badge text="Online" variant="green" />;
    if (o === "degraded") return <Badge text="Degraded" variant="amber" />;
    return <Badge text="Offline" variant="red" />;
  }, [data?.overall]);

  const heartbeats = useMemo(() => {
    const items = Array.isArray(data?.heartbeats) ? data!.heartbeats! : [];
    return items
      .slice()
      .sort((a, b) => String(a.service).localeCompare(String(b.service)))
      .slice(0, 20);
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(700px 260px at 20% 0%, color-mix(in oklab, var(--accent) 18%, transparent) 0%, transparent 60%), radial-gradient(440px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 12%, transparent) 0%, transparent 55%)",
          }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <h1 className="text-xl font-extrabold tracking-tight">Status</h1>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">Live system snapshot (DB, outbox, and background jobs).</p>
          </div>

          <div className="flex items-center gap-2">
            {overallBadge}
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]"
              onClick={load}
              disabled={loading}
            >
              refresh
            </button>
          </div>
        </div>

        {err ? <div className="relative mt-3 text-[11px] text-[var(--down)]">{err}</div> : null}
        {loading && !data ? <div className="relative mt-3 text-[11px] text-[var(--muted)]">Checking…</div> : null}

        {data ? (
          <div className="relative mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Database</div>
              <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">
                {data.db?.ok ? "ok" : "down"}
                {typeof data.db?.latency_ms === "number" ? (
                  <span className="ml-2 text-[11px] text-[var(--muted)]">{data.db.latency_ms}ms</span>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Outbox</div>
              <div className="mt-2 text-[11px] text-[var(--muted)]">
                open <span className="text-[var(--foreground)] font-semibold">{data.outbox?.open ?? 0}</span>
                {" · "}dead <span className="text-[var(--foreground)] font-semibold">{data.outbox?.dead ?? 0}</span>
                {" · "}errors <span className="text-[var(--foreground)] font-semibold">{data.outbox?.with_errors ?? 0}</span>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Expected Jobs</div>
              <div className="mt-2 text-[11px] text-[var(--muted)]">
                {Array.isArray(data.expected_services) && data.expected_services.length > 0 ? (
                  <>
                    {data.expected_services.length} configured
                    <div className="mt-1 text-[10px]">
                      stale: {Array.isArray(data.stale_expected_services) && data.stale_expected_services.length ? (
                        <span className="text-[var(--down)]">{data.stale_expected_services.join(", ")}</span>
                      ) : (
                        <span className="text-[var(--muted)]">none</span>
                      )}
                    </div>
                  </>
                ) : (
                  <span className="text-[var(--muted)]">none configured</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Latency</div>
              <div className="mt-2 text-[11px] text-[var(--muted)]">
                took <span className="text-[var(--foreground)] font-semibold">{Math.max(0, Number(data.took_ms ?? 0))}ms</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="text-sm font-semibold text-[var(--foreground)]">Heartbeats</div>
          <div className="text-[11px] text-[var(--muted)]">{heartbeats.length}</div>
        </div>
        <div className="border-t border-[var(--border)]">
          {heartbeats.length === 0 ? (
            <div className="px-4 py-4 text-xs text-[var(--muted)]">No heartbeats recorded yet.</div>
          ) : (
            <table className="w-full text-[11px]">
              <tbody>
                {heartbeats.map((hb) => {
                  const svc = String(hb.service);
                  const status = String(hb.status ?? "ok");
                  const variant = status === "ok" ? "green" : status === "degraded" ? "amber" : "red";
                  const last = hb.last_seen_at ? new Date(String(hb.last_seen_at)).toLocaleString() : "—";
                  return (
                    <tr key={svc} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="px-4 py-2 font-semibold text-[var(--foreground)]">{svc}</td>
                      <td className="px-4 py-2 text-right">
                        <Badge text={status} variant={variant as any} />
                      </td>
                      <td className="px-4 py-2 text-right text-[10px] text-[var(--muted)]">{last}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="text-[11px] text-[var(--muted)]">
        Tip: for operational monitoring, set expectations via env (e.g. `EXPECT_OUTBOX_WORKER=1`).
      </div>
    </div>
  );
}
