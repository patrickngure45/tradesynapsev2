"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";

type HeartbeatRow = {
  service: string;
  status: string;
  details_json: unknown;
  last_seen_at: string | null;
  updated_at: string | null;
};

type HeartbeatsResponse = {
  ok: true;
  now: string;
  config: {
    is_prod: boolean;
    cron_secret_configured: boolean;
    internal_service_secret_configured: boolean;
    blockchain: {
      bsc_rpc_url_configured: boolean;
      deployer_private_key_configured: boolean;
      citadel_master_seed_configured: boolean;
    };
    enabled: {
      conditional_orders: boolean;
      recurring_buys: boolean;
      deposit_scan: boolean;
      sweep_deposits: boolean;
      twap: boolean;
    };
  };
  heartbeats: HeartbeatRow[];
  locks: Array<{
    key: string;
    holder_id: string | null;
    held_until: string | null;
    updated_at: string | null;
  }>;
  outbox: {
    totals: {
      open_total: number;
      ready: number;
      locked: number;
      scheduled: number;
      dead_lettered: number;
    };
    by_topic: Array<{
      topic: string;
      open_total: number;
      ready: number;
      locked: number;
      scheduled: number;
      dead_lettered: number;
    }>;
  };
};

type RunResponse = {
  ok: boolean;
  job:
    | "conditional_orders"
    | "recurring_buys"
    | "outbox_worker"
    | "deposit_scan_bsc"
    | "deposit_finalize_bsc"
    | "sweep_deposits_bsc"
    | "twap"
    | "ops_alerts";
  status: number;
  data: unknown;
};

type DeadLetterRow = {
  id: string;
  topic: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  payload_json: unknown;
  attempts: number;
  last_error: string | null;
  dead_lettered_at: string | null;
  visible_at: string | null;
  locked_at: string | null;
  lock_id: string | null;
  created_at: string;
  processed_at: string | null;
};

type DeadLettersResponse = {
  dead_letters: DeadLetterRow[];
  total: number;
  count: number;
  limit: number;
  offset: number;
};

type AuditRow = {
  id: number;
  actor_id: string | null;
  actor_type: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip: string | null;
  request_id: string | null;
  detail: unknown;
  created_at: string;
};

type AuditLogResponse = {
  rows: AuditRow[];
  total: number;
  limit: number;
  offset: number;
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

function statusPill(status: string): { text: string; className: string } {
  const s = String(status || "").toLowerCase();
  if (s === "ok") return { text: "OK", className: "bg-emerald-500/20 text-emerald-200" };
  if (s === "degraded") return { text: "DEGRADED", className: "bg-amber-500/20 text-amber-200" };
  if (s === "error") return { text: "ERROR", className: "bg-rose-500/20 text-rose-200" };
  return { text: "MISSING", className: "bg-neutral-500/20 text-neutral-200" };
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AutomationOpsAdminClient() {
  const [heartbeats, setHeartbeats] = useState<HeartbeatRow[]>([]);
  const [locks, setLocks] = useState<HeartbeatsResponse["locks"]>([]);
  const [outbox, setOutbox] = useState<HeartbeatsResponse["outbox"] | null>(null);
  const [config, setConfig] = useState<HeartbeatsResponse["config"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [runningJob, setRunningJob] = useState<RunResponse["job"] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<RunResponse | null>(null);
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [sequenceOutput, setSequenceOutput] = useState<Array<{ step: string; result: RunResponse | { ok: false; error: string } }>>([]);
  const [condSequenceRunning, setCondSequenceRunning] = useState(false);
  const [condSequenceOutput, setCondSequenceOutput] = useState<Array<{ step: string; result: RunResponse | { ok: false; error: string } }>>([]);

  const [flushingTopic, setFlushingTopic] = useState<string | null>(null);
  const [releasingLockKey, setReleasingLockKey] = useState<string | null>(null);

  const [dlLoading, setDlLoading] = useState(true);
  const [dlError, setDlError] = useState<string | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetterRow[]>([]);
  const [dlActionId, setDlActionId] = useState<string | null>(null);
  const [dlTopic, setDlTopic] = useState<string>("");
  const [dlBulkBusy, setDlBulkBusy] = useState<"retry" | "resolve" | null>(null);

  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);

  const [sweepExecute, setSweepExecute] = useState(false);
  const [sweepForce, setSweepForce] = useState(false);
  const [sweepGasTopups, setSweepGasTopups] = useState(false);
  const [sweepTokens, setSweepTokens] = useState(false);
  const [sweepSymbols, setSweepSymbols] = useState("USDT,USDC,WBNB");

  const [scanMaxBlocks, setScanMaxBlocks] = useState("60");
  const [scanBlocksPerBatch, setScanBlocksPerBatch] = useState("30");
  const [scanMaxMs, setScanMaxMs] = useState("20000");
  const [scanConfirmations, setScanConfirmations] = useState("");
  const [scanNative, setScanNative] = useState(true);
  const [scanTokens, setScanTokens] = useState(false);
  const [scanFinalizeAfter, setScanFinalizeAfter] = useState(true);
  const [scanSymbols, setScanSymbols] = useState("");

  const [finalizeMax, setFinalizeMax] = useState("250");
  const [finalizeMaxMs, setFinalizeMaxMs] = useState("20000");
  const [finalizeConfirmations, setFinalizeConfirmations] = useState("");

  const [twapMax, setTwapMax] = useState("50");

  const [outboxTopics, setOutboxTopics] = useState("ex.conditional.evaluate");
  const [outboxMaxMs, setOutboxMaxMs] = useState("25000");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch<HeartbeatsResponse>("/api/exchange/admin/cron/heartbeats", { cache: "no-store" });
      setHeartbeats(res.heartbeats);
      setLocks(res.locks);
      setOutbox(res.outbox);
      setConfig(res.config);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "load_failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDeadLetters = useCallback(async () => {
    setDlLoading(true);
    setDlError(null);
    try {
      const qs = new URLSearchParams({ limit: "20", offset: "0" });
      if (dlTopic.trim()) qs.set("topic", dlTopic.trim());
      const res = await adminFetch<DeadLettersResponse>(`/api/exchange/admin/outbox/dead-letters?${qs.toString()}`, {
        cache: "no-store",
      });
      setDeadLetters(res.dead_letters ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "dead_letters_load_failed";
      setDlError(msg);
    } finally {
      setDlLoading(false);
    }
  }, [dlTopic]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await adminFetch<AuditLogResponse>("/api/exchange/admin/audit-log?action=admin.&limit=25&offset=0", {
        cache: "no-store",
      });
      setAuditRows(Array.isArray(res.rows) ? res.rows : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "audit_load_failed";
      setAuditError(msg);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDeadLetters();
  }, [loadDeadLetters]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadDeadLetters(), loadAudit()]);
  }, [load, loadAudit, loadDeadLetters]);

  const dlBulkAction = useCallback(async (action: "retry" | "resolve") => {
    const topic = dlTopic.trim();
    if (!topic) return;
    const verb = action === "retry" ? "Retry" : "Resolve";
    if (!confirm(`${verb} up to 50 dead letters for topic?\n\n${topic}`)) return;

    setDlBulkBusy(action);
    setDlError(null);
    try {
      await adminFetch("/api/exchange/admin/outbox/dead-letters/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, action, limit: 50 }),
      });
      await refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "bulk_action_failed";
      setDlError(msg);
    } finally {
      setDlBulkBusy(null);
    }
  }, [dlTopic, refreshAll]);

  const runJob = useCallback(
    async (job: RunResponse["job"]) => {
      setRunningJob(job);
      setRunError(null);
      try {
        const payload =
          job === "conditional_orders"
            ? { job, limit: 100 }
            : job === "recurring_buys"
              ? { job, max: 50 }
              : job === "outbox_worker"
                ? {
                    job,
                    batch: 25,
                    max_batches: 5,
                    outbox_max_ms: Number(outboxMaxMs) || 25000,
                    topics: outboxTopics.trim()
                      ? outboxTopics
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean)
                      : undefined,
                  }
                : job === "deposit_scan_bsc"
                  ? {
                      job,
                      max_blocks: Number(scanMaxBlocks) || 60,
                      blocks_per_batch: Number(scanBlocksPerBatch) || 30,
                      max_ms: Number(scanMaxMs) || 20000,
                      confirmations: scanConfirmations.trim() ? Number(scanConfirmations) : undefined,
                      native: scanNative ? 1 : 0,
                      tokens: scanTokens ? 1 : 0,
                      finalize: scanFinalizeAfter ? 1 : 0,
                      symbols: scanSymbols.trim() ? scanSymbols.trim() : undefined,
                    }
                  : job === "deposit_finalize_bsc"
                    ? {
                        job,
                        max: Number(finalizeMax) || 250,
                        max_ms: Number(finalizeMaxMs) || 20000,
                        confirmations: finalizeConfirmations.trim() ? Number(finalizeConfirmations) : undefined,
                      }
                    : job === "sweep_deposits_bsc"
                      ? {
                          job,
                          execute: sweepExecute ? 1 : 0,
                              force: sweepForce ? 1 : 0,
                          gas_topups: sweepGasTopups ? 1 : 0,
                          tokens: sweepTokens ? 1 : 0,
                          symbols: sweepSymbols.trim() ? sweepSymbols.trim() : undefined,
                        }
                          : job === "ops_alerts"
                            ? { job }
                            : { job, max: Number(twapMax) || 50 };

        const res = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        setLastRun(res);
        await load();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "run_failed";
        setRunError(msg);
      } finally {
        setRunningJob(null);
      }
    },
    [
      load,
      finalizeConfirmations,
      finalizeMax,
      finalizeMaxMs,
      outboxMaxMs,
      outboxTopics,
      scanBlocksPerBatch,
      scanConfirmations,
      scanFinalizeAfter,
      scanMaxBlocks,
      scanMaxMs,
      scanNative,
      scanSymbols,
      scanTokens,
      sweepExecute,
      sweepForce,
      sweepGasTopups,
      sweepSymbols,
      sweepTokens,
      twapMax,
    ],
  );

  const runDepositSequence = useCallback(async () => {
    setSequenceRunning(true);
    setRunError(null);
    setSequenceOutput([]);

    const push = (step: string, result: any) => {
      setSequenceOutput((prev) => [...prev, { step, result }]);
    };

    try {
      const scanPayload = {
        job: "deposit_scan_bsc" as const,
        max_blocks: Number(scanMaxBlocks) || 60,
        blocks_per_batch: Number(scanBlocksPerBatch) || 30,
        max_ms: Number(scanMaxMs) || 20000,
        confirmations: scanConfirmations.trim() ? Number(scanConfirmations) : undefined,
        native: scanNative ? 1 : 0,
        tokens: scanTokens ? 1 : 0,
        finalize: scanFinalizeAfter ? 1 : 0,
        symbols: scanSymbols.trim() ? scanSymbols.trim() : undefined,
      };

      const scanRes = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scanPayload),
      });
      push("scan", scanRes);

      const finalizePayload = {
        job: "deposit_finalize_bsc" as const,
        max: Number(finalizeMax) || 250,
        max_ms: Number(finalizeMaxMs) || 20000,
        confirmations: finalizeConfirmations.trim() ? Number(finalizeConfirmations) : undefined,
      };

      const finalizeRes = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(finalizePayload),
      });
      push("finalize", finalizeRes);

      const sweepPayload = {
        job: "sweep_deposits_bsc" as const,
        execute: 0,
        force: sweepForce ? 1 : 0,
        gas_topups: 0,
        tokens: sweepTokens ? 1 : 0,
        symbols: sweepSymbols.trim() ? sweepSymbols.trim() : undefined,
      };

      const sweepRes = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sweepPayload),
      });
      push("sweep_dry_run", sweepRes);

      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sequence_failed";
      push("error", { ok: false, error: msg });
      setRunError(msg);
    } finally {
      setSequenceRunning(false);
    }
  }, [
    finalizeConfirmations,
    finalizeMax,
    finalizeMaxMs,
    load,
    scanBlocksPerBatch,
    scanConfirmations,
    scanFinalizeAfter,
    scanMaxBlocks,
    scanMaxMs,
    scanNative,
    scanSymbols,
    scanTokens,
    sweepSymbols,
    sweepTokens,
  ]);

  const runDepositSequenceExecuteSweep = useCallback(async () => {
    if (!confirm("Execute sweep after scan/finalize? This will attempt on-chain operations.")) return;

    setSequenceRunning(true);
    setRunError(null);
    setSequenceOutput([]);

    const push = (step: string, result: any) => {
      setSequenceOutput((prev) => [...prev, { step, result }]);
    };

    try {
      const scanPayload = {
        job: "deposit_scan_bsc" as const,
        max_blocks: Number(scanMaxBlocks) || 60,
        blocks_per_batch: Number(scanBlocksPerBatch) || 30,
        max_ms: Number(scanMaxMs) || 20000,
        confirmations: scanConfirmations.trim() ? Number(scanConfirmations) : undefined,
        native: scanNative ? 1 : 0,
        tokens: scanTokens ? 1 : 0,
        finalize: scanFinalizeAfter ? 1 : 0,
        symbols: scanSymbols.trim() ? scanSymbols.trim() : undefined,
      };

      const scanRes = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scanPayload),
      });
      push("scan", scanRes);

      const finalizePayload = {
        job: "deposit_finalize_bsc" as const,
        max: Number(finalizeMax) || 250,
        max_ms: Number(finalizeMaxMs) || 20000,
        confirmations: finalizeConfirmations.trim() ? Number(finalizeConfirmations) : undefined,
      };

      const finalizeRes = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(finalizePayload),
      });
      push("finalize", finalizeRes);

      const sweepPayload = {
        job: "sweep_deposits_bsc" as const,
        execute: 1,
        force: sweepForce ? 1 : 0,
        gas_topups: sweepGasTopups ? 1 : 0,
        tokens: sweepTokens ? 1 : 0,
        symbols: sweepSymbols.trim() ? sweepSymbols.trim() : undefined,
      };

      const sweepRes = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sweepPayload),
      });
      push("sweep_execute", sweepRes);

      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sequence_failed";
      push("error", { ok: false, error: msg });
      setRunError(msg);
    } finally {
      setSequenceRunning(false);
    }
  }, [
    finalizeConfirmations,
    finalizeMax,
    finalizeMaxMs,
    load,
    scanBlocksPerBatch,
    scanConfirmations,
    scanFinalizeAfter,
    scanMaxBlocks,
    scanMaxMs,
    scanNative,
    scanSymbols,
    scanTokens,
    sweepGasTopups,
    sweepForce,
    sweepSymbols,
    sweepTokens,
  ]);

  const runConditionalCycle = useCallback(async () => {
    setCondSequenceRunning(true);
    setRunError(null);
    setCondSequenceOutput([]);

    const push = (step: string, result: any) => {
      setCondSequenceOutput((prev) => [...prev, { step, result }]);
    };

    try {
      const enqueueRes = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: "conditional_orders", limit: 200 }),
      });
      push("enqueue", enqueueRes);

      const outboxRes = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          job: "outbox_worker",
          batch: 25,
          max_batches: 10,
          outbox_max_ms: Number(outboxMaxMs) || 25000,
          topics: ["ex.conditional.evaluate"],
        }),
      });
      push("outbox_worker", outboxRes);

      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sequence_failed";
      push("error", { ok: false, error: msg });
      setRunError(msg);
    } finally {
      setCondSequenceRunning(false);
    }
  }, [load, outboxMaxMs]);

  const flushTopic = useCallback(
    async (topic: string | null) => {
      const key = topic ?? "__all__";
      setFlushingTopic(key);
      setRunError(null);
      try {
        const payload: any = {
          job: "outbox_worker",
          batch: 25,
          max_batches: 10,
          outbox_max_ms: Number(outboxMaxMs) || 25000,
        };
        if (topic) payload.topics = [topic];

        const res = await adminFetch<RunResponse>("/api/exchange/admin/cron/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        setLastRun(res);
        await load();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "flush_failed";
        setRunError(msg);
      } finally {
        setFlushingTopic(null);
      }
    },
    [load, outboxMaxMs],
  );

  const dlAction = useCallback(
    async (id: string, action: "retry" | "resolve") => {
      setDlActionId(id);
      setDlError(null);
      try {
        await adminFetch("/api/exchange/admin/outbox/dead-letters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
        await Promise.all([loadDeadLetters(), load()]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "dead_letter_action_failed";
        setDlError(msg);
      } finally {
        setDlActionId(null);
      }
    },
    [load, loadDeadLetters],
  );

  const releaseLock = useCallback(
    async (key: string) => {
      if (!confirm(`Release job lock?\n\n${key}\n\nOnly do this if you're sure the job is stuck.`)) return;
      setReleasingLockKey(key);
      setRunError(null);
      try {
        await adminFetch("/api/exchange/admin/cron/locks/release", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key }),
        });
        await load();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "release_lock_failed";
        setRunError(msg);
      } finally {
        setReleasingLockKey(null);
      }
    },
    [load],
  );

  const byService = useMemo(() => new Map(heartbeats.map((h) => [h.service, h] as const)), [heartbeats]);
  const byLockKey = useMemo(() => new Map(locks.map((l) => [l.key, l] as const)), [locks]);

  const jobs = useMemo(() => {
    return [
      {
        title: "Conditional Orders (enqueue)",
        service: "exchange:conditional-orders",
        lockKey: "exchange:conditional-orders:enqueue",
        job: "conditional_orders" as const,
        description: "Enqueues evaluation work to the outbox.",
      },
      {
        title: "Recurring Buys (execute)",
        service: "cron:recurring-buys",
        lockKey: "exchange:recurring-buys",
        job: "recurring_buys" as const,
        description: "Executes due DCA plans (quotes + journals).",
      },
      {
        title: "Outbox Worker", 
        service: "outbox-worker",
        lockKey: "exchange:outbox-worker",
        job: "outbox_worker" as const,
        description: "Runs outbox handlers (incl. conditional order evaluation).",
      },
      {
        title: "Ops Alerts (email)",
        service: "cron:ops-alerts",
        lockKey: null,
        job: "ops_alerts" as const,
        description: "Checks operational signals and emails when degraded (deduped).",
      },
      {
        title: "Deposit Scan (BSC)",
        service: "deposit-scan:bsc",
        lockKey: "exchange:scan-deposits:bsc",
        job: "deposit_scan_bsc" as const,
        description: "Scans chain and credits new deposits (safe defaults; tokens off).",
      },
      {
        title: "Deposit Finalize (BSC)",
        service: "deposit-finalize:bsc",
        lockKey: "exchange:finalize-deposits:bsc",
        job: "deposit_finalize_bsc" as const,
        description: "Finalizes pending deposits after confirmations.",
      },
      {
        title: "Sweep Deposits (BSC)",
        service: "sweep-deposits:bsc",
        lockKey: "exchange:sweep-deposits:bsc",
        job: "sweep_deposits_bsc" as const,
        description: "Sweeps user deposit addresses into the hot wallet (default: dry run).",
      },
      {
        title: "TWAP (execute)",
        service: "cron:twap",
        lockKey: "exchange:twap",
        job: "twap" as const,
        description: "Executes due TWAP slices using internal service auth.",
      },
    ];
  }, []);

  const isStale = (lastSeen: string | null): boolean => {
    if (!lastSeen) return false;
    const ts = Date.parse(lastSeen);
    if (!Number.isFinite(ts)) return false;
    const ageMs = Date.now() - ts;
    return ageMs > 30 * 60_000; // 30 minutes
  };

  const lockActive = (lockKey: string | null): { active: boolean; held_until: string | null; holder_id: string | null; updated_at: string | null } => {
    if (!lockKey) return { active: false, held_until: null, holder_id: null, updated_at: null };
    const l = byLockKey.get(lockKey);
    if (!l?.held_until) return { active: false, held_until: null, holder_id: l?.holder_id ?? null, updated_at: l?.updated_at ?? null };
    const until = Date.parse(l.held_until);
    if (!Number.isFinite(until)) return { active: false, held_until: l.held_until, holder_id: l.holder_id, updated_at: l.updated_at };
    return { active: until > Date.now(), held_until: l.held_until, holder_id: l.holder_id, updated_at: l.updated_at };
  };

  const sweepLock = lockActive("exchange:sweep-deposits:bsc");

  return (
    <div className="space-y-4">
      <V2Card>
        <V2CardHeader title="Config" subtitle="Runtime enablement checks (admin-only; booleans only)." />
        <V2CardBody>
          {config ? (
            <div className="space-y-3">
              {config.is_prod && !config.cron_secret_configured ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Cron secret is not configured. Admin “Run now” will fail in production.
                </div>
              ) : null}
              {config.is_prod && config.enabled.twap && !config.internal_service_secret_configured ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  TWAP is enabled but INTERNAL_SERVICE_SECRET is not configured.
                </div>
              ) : null}
              {config.is_prod && config.enabled.deposit_scan && !config.blockchain.bsc_rpc_url_configured ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Deposit scan is enabled but BSC_RPC_URL is not configured.
                </div>
              ) : null}
              {config.is_prod && config.enabled.sweep_deposits && (!config.blockchain.deployer_private_key_configured || !config.blockchain.citadel_master_seed_configured) ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Sweep deposits is enabled but sweep keys are missing (DEPLOYER_PRIVATE_KEY and/or CITADEL_MASTER_SEED).
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3 text-sm text-[var(--v2-text)]">
                  <div className="text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">Secrets</div>
                  <div className="mt-2 text-sm text-[var(--v2-muted)]">
                    Cron secret: <span className="font-semibold text-[var(--v2-text)]">{config.cron_secret_configured ? "configured" : "missing"}</span>
                    <br />
                    Internal service secret: <span className="font-semibold text-[var(--v2-text)]">{config.internal_service_secret_configured ? "configured" : "missing"}</span>
                    <br />
                    BSC RPC URL: <span className="font-semibold text-[var(--v2-text)]">{config.blockchain.bsc_rpc_url_configured ? "configured" : "missing"}</span>
                    <br />
                    Deployer key: <span className="font-semibold text-[var(--v2-text)]">{config.blockchain.deployer_private_key_configured ? "configured" : "missing"}</span>
                    <br />
                    Master seed: <span className="font-semibold text-[var(--v2-text)]">{config.blockchain.citadel_master_seed_configured ? "configured" : "missing"}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3 text-sm text-[var(--v2-text)]">
                  <div className="text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">Enable Flags</div>
                  <div className="mt-2 text-sm text-[var(--v2-muted)]">
                    Conditional orders: <span className="font-semibold text-[var(--v2-text)]">{config.enabled.conditional_orders ? "on" : "off"}</span>
                    <br />
                    Recurring buys: <span className="font-semibold text-[var(--v2-text)]">{config.enabled.recurring_buys ? "on" : "off"}</span>
                    <br />
                    Deposit scan: <span className="font-semibold text-[var(--v2-text)]">{config.enabled.deposit_scan ? "on" : "off"}</span>
                    <br />
                    Sweep deposits: <span className="font-semibold text-[var(--v2-text)]">{config.enabled.sweep_deposits ? "on" : "off"}</span>
                    <br />
                    TWAP: <span className="font-semibold text-[var(--v2-text)]">{config.enabled.twap ? "on" : "off"}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--v2-muted)]">Loading…</div>
          )}

          <div className="mt-3 flex items-center justify-end">
            <V2Button variant="ghost" size="sm" onClick={refreshAll}>
              Refresh all
            </V2Button>
          </div>
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Quick Runs" subtitle="One-click sequences for common ops workflows." />
        <V2CardBody>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4">
              <div className="text-sm text-[var(--v2-muted)]">Deposit pipeline: Scan → Finalize → Sweep (dry-run)</div>
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <V2Button variant="primary" size="sm" onClick={runDepositSequence} disabled={sequenceRunning || sweepLock.active}>
                    {sequenceRunning ? "Running…" : sweepLock.active ? "Sweep locked" : "Run (dry-run sweep)"}
                  </V2Button>
                  <V2Button
                    variant="secondary"
                    size="sm"
                    onClick={runDepositSequenceExecuteSweep}
                    disabled={sequenceRunning || sweepLock.active}
                  >
                    Execute sweep
                  </V2Button>
                </div>
                {sweepLock.active && sweepLock.held_until ? (
                  <div className="mt-2 text-xs text-[var(--v2-muted)]">Sweep lock until: {sweepLock.held_until}</div>
                ) : null}
              </div>

              {sequenceOutput.length ? (
                <div className="mt-3 space-y-2">
                  {sequenceOutput.map((s, idx) => (
                    <div key={`${s.step}-${idx}`} className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">{s.step}</div>
                      <pre className="overflow-x-auto text-[11px] text-[var(--v2-text)]">{prettyJson((s.result as any)?.data ?? s.result)}</pre>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4">
              <div className="text-sm text-[var(--v2-muted)]">Conditional orders: Enqueue → Outbox worker (ex.conditional.evaluate)</div>
              <div className="mt-3">
                <V2Button variant="primary" size="sm" onClick={runConditionalCycle} disabled={condSequenceRunning}>
                  {condSequenceRunning ? "Running…" : "Run conditional cycle"}
                </V2Button>
              </div>

              {condSequenceOutput.length ? (
                <div className="mt-3 space-y-2">
                  {condSequenceOutput.map((s, idx) => (
                    <div key={`${s.step}-${idx}`} className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">{s.step}</div>
                      <pre className="overflow-x-auto text-[11px] text-[var(--v2-text)]">{prettyJson((s.result as any)?.data ?? s.result)}</pre>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Recent Ops Activity" subtitle="Latest admin ops actions from the audit log." />
        <V2CardBody>
          {auditLoading ? <div className="text-sm text-[var(--v2-muted)]">Loading…</div> : null}
          {auditError ? <div className="text-sm font-semibold text-[var(--v2-down)]">{auditError}</div> : null}

          {!auditLoading && auditRows.length === 0 ? (
            <div className="text-sm text-[var(--v2-muted)]">No recent admin ops activity.</div>
          ) : null}

          {auditRows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Time</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Action</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Target</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((r) => {
                    const actorShort = r.actor_id ? `${r.actor_id.slice(0, 8)}…` : "—";
                    const target = r.resource_id ? String(r.resource_id) : r.resource_type ? String(r.resource_type) : "—";
                    return (
                      <tr key={String(r.id)} className="text-sm text-[var(--v2-text)]">
                        <td className="border-b border-[var(--v2-border)] px-2 py-2 text-xs text-[var(--v2-muted)]">{r.created_at}</td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2 font-mono text-[12px]">{r.action}</td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2 font-mono text-[12px]">{target}</td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2 text-xs text-[var(--v2-muted)]">{actorShort}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end">
            <V2Button variant="ghost" size="sm" onClick={loadAudit} disabled={auditLoading}>
              Refresh
            </V2Button>
          </div>
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Outbox Queue" subtitle="Backlog by topic (ready/locked/scheduled/dead-letter)." />
        <V2CardBody>
          {outbox ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v2-muted)]">
                  <span className="rounded-full bg-[var(--v2-surface-2)] px-2 py-1">Open: {outbox.totals.open_total}</span>
                  <span className="rounded-full bg-[var(--v2-surface-2)] px-2 py-1">Ready: {outbox.totals.ready}</span>
                  <span className="rounded-full bg-[var(--v2-surface-2)] px-2 py-1">Locked: {outbox.totals.locked}</span>
                  <span className="rounded-full bg-[var(--v2-surface-2)] px-2 py-1">Scheduled: {outbox.totals.scheduled}</span>
                  <span className="rounded-full bg-[var(--v2-surface-2)] px-2 py-1">Dead-letter: {outbox.totals.dead_lettered}</span>
                </div>

                <div className="flex items-center gap-2">
                  <V2Button
                    variant="secondary"
                    size="sm"
                    onClick={() => flushTopic(null)}
                    disabled={flushingTopic !== null}
                  >
                    {flushingTopic === "__all__" ? "Flushing…" : "Flush all"}
                  </V2Button>
                </div>
              </div>

              {outbox.by_topic.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Topic</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Ready</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Locked</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Scheduled</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Dead</th>
                        <th className="border-b border-[var(--v2-border)] px-2 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outbox.by_topic.map((r) => (
                        <tr key={r.topic} className="text-sm text-[var(--v2-text)]">
                          <td className="border-b border-[var(--v2-border)] px-2 py-2 font-mono text-[12px]">{r.topic}</td>
                          <td className="border-b border-[var(--v2-border)] px-2 py-2">{r.ready}</td>
                          <td className="border-b border-[var(--v2-border)] px-2 py-2">{r.locked}</td>
                          <td className="border-b border-[var(--v2-border)] px-2 py-2">{r.scheduled}</td>
                          <td className="border-b border-[var(--v2-border)] px-2 py-2">{r.dead_lettered}</td>
                          <td className="border-b border-[var(--v2-border)] px-2 py-2">
                            <V2Button
                              variant="secondary"
                              size="sm"
                              onClick={() => flushTopic(r.topic)}
                              disabled={flushingTopic !== null}
                            >
                              {flushingTopic === r.topic ? "Flushing…" : "Flush"}
                            </V2Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-[var(--v2-muted)]">No outbox events.</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-[var(--v2-muted)]">Loading…</div>
          )}
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Dead Letters" subtitle="Poison messages that exceeded retry attempts." />
        <V2CardBody>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-semibold text-[var(--v2-muted)]">Filter by topic</div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={dlTopic}
                onChange={(e) => setDlTopic(e.target.value)}
                className="h-9 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[13px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
              >
                <option value="">All topics</option>
                {(outbox?.by_topic ?? []).map((t) => (
                  <option key={t.topic} value={t.topic}>
                    {t.topic}
                  </option>
                ))}
              </select>
              <V2Button
                variant="secondary"
                size="sm"
                disabled={!dlTopic.trim() || dlBulkBusy !== null}
                onClick={() => dlBulkAction("retry")}
              >
                {dlBulkBusy === "retry" ? "Retrying…" : "Retry all"}
              </V2Button>
              <V2Button
                variant="secondary"
                size="sm"
                disabled={!dlTopic.trim() || dlBulkBusy !== null}
                onClick={() => dlBulkAction("resolve")}
              >
                {dlBulkBusy === "resolve" ? "Resolving…" : "Resolve all"}
              </V2Button>
            </div>
          </div>

          {dlLoading ? <div className="text-sm text-[var(--v2-muted)]">Loading…</div> : null}
          {dlError ? <div className="text-sm font-semibold text-[var(--v2-down)]">{dlError}</div> : null}

          {!dlLoading && deadLetters.length === 0 ? (
            <div className="text-sm text-[var(--v2-muted)]">No dead letters.</div>
          ) : null}

          {deadLetters.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Topic</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Attempts</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Error</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Dead-lettered</th>
                    <th className="border-b border-[var(--v2-border)] px-2 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deadLetters.map((dl) => {
                    const busy = dlActionId === dl.id;
                    const errShort = (dl.last_error ?? "").slice(0, 120);
                    return (
                      <tr key={dl.id} className="text-sm text-[var(--v2-text)]">
                        <td className="border-b border-[var(--v2-border)] px-2 py-2 font-mono text-[12px]">{dl.topic}</td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2">{dl.attempts}</td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2 text-xs text-[var(--v2-muted)]">{errShort || "—"}</td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2 text-xs text-[var(--v2-muted)]">{dl.dead_lettered_at ?? "—"}</td>
                        <td className="border-b border-[var(--v2-border)] px-2 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <V2Button variant="secondary" size="sm" disabled={busy} onClick={() => dlAction(dl.id, "retry")}>
                              {busy ? "Working…" : "Retry"}
                            </V2Button>
                            <V2Button variant="secondary" size="sm" disabled={busy} onClick={() => dlAction(dl.id, "resolve")}>
                              Resolve
                            </V2Button>
                            <V2Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(dl.id);
                                } catch {
                                  // ignore
                                }
                              }}
                            >
                              Copy ID
                            </V2Button>
                          </div>

                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-semibold text-[var(--v2-muted)]">Details</summary>
                            <div className="mt-2 space-y-2">
                              <div className="text-xs text-[var(--v2-muted)]">
                                <span className="font-semibold">Event ID:</span> <span className="font-mono">{dl.id}</span>
                              </div>
                              {dl.aggregate_type || dl.aggregate_id ? (
                                <div className="text-xs text-[var(--v2-muted)]">
                                  <span className="font-semibold">Aggregate:</span>{" "}
                                  <span className="font-mono">{dl.aggregate_type ?? "—"}</span> · <span className="font-mono">{dl.aggregate_id ?? "—"}</span>
                                </div>
                              ) : null}
                              {dl.last_error ? (
                                <pre className="overflow-x-auto rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3 text-[11px] text-[var(--v2-text)]">{dl.last_error}</pre>
                              ) : null}
                              <pre className="overflow-x-auto rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3 text-[11px] text-[var(--v2-text)]">
                                {prettyJson(dl.payload_json)}
                              </pre>
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end">
            <V2Button variant="ghost" size="sm" onClick={loadDeadLetters} disabled={dlLoading}>
              Refresh
            </V2Button>
          </div>
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Jobs" subtitle="Last seen status comes from service heartbeats." />
        <V2CardBody>
          {loading ? <div className="text-sm text-[var(--v2-muted)]">Loading…</div> : null}
          {error ? <div className="text-sm font-semibold text-[var(--v2-down)]">{error}</div> : null}
          {runError ? <div className="text-sm font-semibold text-[var(--v2-down)]">{runError}</div> : null}

          <div className="space-y-3">
            {jobs.map((j) => {
              const hb = byService.get(j.service);
              const pill = statusPill(hb?.status ?? "missing");
              const isRunning = runningJob === j.job;
              const stale = isStale(hb?.last_seen_at ?? null);
              const lock = lockActive(j.lockKey);
              const runDisabled = isRunning || lock.active;
              const lockBusy = releasingLockKey === j.lockKey;
              return (
                <div key={j.service} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="text-[15px] font-extrabold text-[var(--v2-text)]">{j.title}</div>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${pill.className}`}>{pill.text}</span>
                        {stale ? (
                          <span className="inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-200">STALE</span>
                        ) : null}
                        {lock.active ? (
                          <span className="inline-flex rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-bold text-blue-200">LOCKED</span>
                        ) : null}
                      </div>
                      <div className="text-sm text-[var(--v2-muted)]">{j.description}</div>
                      <div className="text-xs text-[var(--v2-muted)]">
                        Service: <span className="font-mono">{j.service}</span>
                        {hb?.last_seen_at ? <> · Last seen: {hb.last_seen_at}</> : null}
                        {lock.active && lock.held_until ? <> · Lock until: {lock.held_until}</> : null}
                        {lock.active && lock.holder_id ? (
                          <>
                            {" "}· Holder: <span className="font-mono">{lock.holder_id}</span>
                            <button
                              className="ml-2 inline-flex rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--v2-muted)] hover:bg-[var(--v2-surface)]"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(lock.holder_id!);
                                } catch {
                                  // ignore
                                }
                              }}
                            >
                              Copy
                            </button>
                          </>
                        ) : null}
                        {lock.active && lock.updated_at ? <> · Lock updated: {lock.updated_at}</> : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <V2Button variant="secondary" size="sm" onClick={() => runJob(j.job)} disabled={runDisabled}>
                        {isRunning ? "Running…" : lock.active ? "Locked" : "Run now"}
                      </V2Button>
                      {lock.active && j.lockKey ? (
                        <V2Button
                          variant="danger"
                          size="sm"
                          onClick={() => releaseLock(j.lockKey!)}
                          disabled={lockBusy || isRunning}
                        >
                          {lockBusy ? "Releasing…" : "Release lock"}
                        </V2Button>
                      ) : null}
                    </div>
                  </div>

                  {j.job === "sweep_deposits_bsc" ? (
                    <div className="mt-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">Sweep Options</div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <label className="flex items-center gap-2 text-sm text-[var(--v2-text)]">
                          <input
                            type="checkbox"
                            checked={sweepExecute}
                            onChange={(e) => setSweepExecute(e.target.checked)}
                            className="h-4 w-4 accent-[var(--v2-accent)]"
                          />
                          Execute (otherwise dry run)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-[var(--v2-text)]">
                          <input
                            type="checkbox"
                            checked={sweepForce}
                            onChange={(e) => setSweepForce(e.target.checked)}
                            className="h-4 w-4 accent-[var(--v2-accent)]"
                          />
                          Force (ignore cadence)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-[var(--v2-text)]">
                          <input
                            type="checkbox"
                            checked={sweepGasTopups}
                            onChange={(e) => setSweepGasTopups(e.target.checked)}
                            className="h-4 w-4 accent-[var(--v2-accent)]"
                          />
                          Allow gas topups
                        </label>
                        <label className="flex items-center gap-2 text-sm text-[var(--v2-text)]">
                          <input
                            type="checkbox"
                            checked={sweepTokens}
                            onChange={(e) => setSweepTokens(e.target.checked)}
                            className="h-4 w-4 accent-[var(--v2-accent)]"
                          />
                          Sweep tokens
                        </label>
                      </div>
                      <div className="mt-2">
                        <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Token symbols (comma-separated)</div>
                        <input
                          value={sweepSymbols}
                          onChange={(e) => setSweepSymbols(e.target.value)}
                          placeholder="USDT,USDC,WBNB"
                          className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                        />
                        <div className="mt-1 text-xs text-[var(--v2-muted)]">Leave blank to use server defaults.</div>
                      </div>
                    </div>
                  ) : null}

                  {j.job === "deposit_scan_bsc" ? (
                    <div className="mt-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">Scan Options</div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Max blocks</div>
                          <input
                            value={scanMaxBlocks}
                            onChange={(e) => setScanMaxBlocks(e.target.value)}
                            inputMode="numeric"
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                        </label>
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Blocks/batch</div>
                          <input
                            value={scanBlocksPerBatch}
                            onChange={(e) => setScanBlocksPerBatch(e.target.value)}
                            inputMode="numeric"
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                        </label>
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Max ms</div>
                          <input
                            value={scanMaxMs}
                            onChange={(e) => setScanMaxMs(e.target.value)}
                            inputMode="numeric"
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                        </label>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Confirmations (optional)</div>
                          <input
                            value={scanConfirmations}
                            onChange={(e) => setScanConfirmations(e.target.value)}
                            inputMode="numeric"
                            placeholder=""
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                        </label>
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Token symbols (optional)</div>
                          <input
                            value={scanSymbols}
                            onChange={(e) => setScanSymbols(e.target.value)}
                            placeholder="USDT,USDC"
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                          <div className="mt-1 text-xs text-[var(--v2-muted)]">Only used if “Scan tokens” is enabled.</div>
                        </label>
                        <div className="flex flex-col justify-end gap-2">
                          <label className="flex items-center gap-2 text-sm text-[var(--v2-text)]">
                            <input
                              type="checkbox"
                              checked={scanNative}
                              onChange={(e) => setScanNative(e.target.checked)}
                              className="h-4 w-4 accent-[var(--v2-accent)]"
                            />
                            Scan native
                          </label>
                          <label className="flex items-center gap-2 text-sm text-[var(--v2-text)]">
                            <input
                              type="checkbox"
                              checked={scanTokens}
                              onChange={(e) => setScanTokens(e.target.checked)}
                              className="h-4 w-4 accent-[var(--v2-accent)]"
                            />
                            Scan tokens
                          </label>
                          <label className="flex items-center gap-2 text-sm text-[var(--v2-text)]">
                            <input
                              type="checkbox"
                              checked={scanFinalizeAfter}
                              onChange={(e) => setScanFinalizeAfter(e.target.checked)}
                              className="h-4 w-4 accent-[var(--v2-accent)]"
                            />
                            Finalize after scan
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {j.job === "deposit_finalize_bsc" ? (
                    <div className="mt-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">Finalize Options</div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Max</div>
                          <input
                            value={finalizeMax}
                            onChange={(e) => setFinalizeMax(e.target.value)}
                            inputMode="numeric"
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                        </label>
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Max ms</div>
                          <input
                            value={finalizeMaxMs}
                            onChange={(e) => setFinalizeMaxMs(e.target.value)}
                            inputMode="numeric"
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                        </label>
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Confirmations (optional)</div>
                          <input
                            value={finalizeConfirmations}
                            onChange={(e) => setFinalizeConfirmations(e.target.value)}
                            inputMode="numeric"
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {j.job === "outbox_worker" ? (
                    <div className="mt-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">Outbox Options</div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Topics (comma-separated)</div>
                          <input
                            value={outboxTopics}
                            onChange={(e) => setOutboxTopics(e.target.value)}
                            placeholder="ex.conditional.evaluate"
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                          <div className="mt-1 text-xs text-[var(--v2-muted)]">Leave empty to run all topics.</div>
                        </label>
                        <label className="text-sm text-[var(--v2-text)]">
                          <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Max ms</div>
                          <input
                            value={outboxMaxMs}
                            onChange={(e) => setOutboxMaxMs(e.target.value)}
                            inputMode="numeric"
                            placeholder="25000"
                            className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {j.job === "twap" ? (
                    <div className="mt-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-muted)]">TWAP Options</div>
                      <label className="text-sm text-[var(--v2-text)]">
                        <div className="mb-1 text-xs font-semibold text-[var(--v2-muted)]">Max plans per run</div>
                        <input
                          value={twapMax}
                          onChange={(e) => setTwapMax(e.target.value)}
                          inputMode="numeric"
                          className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
                        />
                      </label>
                    </div>
                  ) : null}

                  {hb?.details_json ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-[var(--v2-muted)]">Details</summary>
                      <pre className="mt-2 overflow-x-auto rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3 text-[11px] text-[var(--v2-text)]">
                        {prettyJson(hb.details_json)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-end">
            <V2Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              Refresh
            </V2Button>
          </div>
        </V2CardBody>
      </V2Card>

      {lastRun ? (
        <V2Card>
          <V2CardHeader title="Last Run" subtitle={`${lastRun.job} · HTTP ${lastRun.status}`} />
          <V2CardBody>
            <pre className="overflow-x-auto rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3 text-[11px] text-[var(--v2-text)]">
              {prettyJson(lastRun.data)}
            </pre>
          </V2CardBody>
        </V2Card>
      ) : null}
    </div>
  );
}
