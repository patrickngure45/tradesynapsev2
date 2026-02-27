import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { runOutboxWorkerOnce } from "@/lib/outbox/workerOnce";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { tryAcquireJobLock, renewJobLock, releaseJobLock } from "@/lib/system/jobLock";
import { requireCronRequestAuth } from "@/lib/auth/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export async function POST(req: NextRequest) {
  const authErr = requireCronRequestAuth(req);
  if (authErr) {
    const status = authErr === "cron_unauthorized" ? 401 : 500;
    return NextResponse.json({ error: authErr }, { status });
  }

  const url = new URL(req.url);
  const batchSize = Number(url.searchParams.get("batch") ?? "");
  const maxBatches = Number(url.searchParams.get("max_batches") ?? "");
  const maxMs = Number(url.searchParams.get("max_ms") ?? "");
  const topicsRaw = (url.searchParams.get("topics") ?? "").trim();
  const topics = topicsRaw
    ? topicsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  const sql = getSql();

  const beat = async (details?: Record<string, unknown>, status: "ok" | "degraded" | "error" = "ok") => {
    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "outbox-worker",
        status,
        details: { ...(details ?? {}) },
      });
    } catch {
      // ignore
    }
  };

  // Prevent overlapping outbox runs across replicas. The worker itself uses row-level locks,
  // but a coarse job lock avoids unnecessary contention and makes cron behavior predictable.
  const lockKey = "exchange:outbox-worker";
  const holderId = `${process.env.RAILWAY_SERVICE_NAME ?? process.env.SERVICE_NAME ?? "web"}:${crypto.randomUUID()}`;
  const lockTtlMs = clampInt(Number(process.env.EXCHANGE_OUTBOX_WORKER_LOCK_TTL_MS ?? 60_000), 10_000, 10 * 60_000);
  const lock = await tryAcquireJobLock(sql as any, { key: lockKey, holderId, ttlMs: lockTtlMs });
  if (!lock.acquired) {
    await beat(
      {
        event: "skipped_locked",
        held_until: lock.held_until,
        holder_id: lock.holder_id,
        topics: topics ?? null,
      },
      "degraded",
    ).catch(() => void 0);

    return NextResponse.json(
      {
        ok: false,
        error: "job_in_progress",
        held_until: lock.held_until,
        holder_id: lock.holder_id,
      },
      { status: 429 },
    );
  }

  const renewEveryMs = clampInt(Math.floor(lockTtlMs / 2), 5_000, 30_000);
  let renewTimer: ReturnType<typeof setInterval> | null = null;
  try {
    renewTimer = setInterval(() => {
      renewJobLock(sql as any, { key: lockKey, holderId, ttlMs: lockTtlMs }).catch(() => {
        // ignore
      });
    }, renewEveryMs);
  } catch {
    // ignore
  }

  try {
    await beat({ event: "start", batch: batchSize || null, max_batches: maxBatches || null, max_ms: maxMs || null, topics: topics ?? null });
    const result = await runOutboxWorkerOnce(sql as any, {
      batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : undefined,
      maxBatches: Number.isFinite(maxBatches) && maxBatches > 0 ? maxBatches : undefined,
      maxMs: Number.isFinite(maxMs) && maxMs > 0 ? maxMs : undefined,
      topics,
    });

    await beat({ event: "done", ...result, topics: topics ?? null });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await beat({ event: "error", message, topics: topics ?? null }, "error");
    return NextResponse.json(
      { ok: false, error: "outbox_worker_failed", message },
      { status: 500 },
    );
  } finally {
    if (renewTimer) {
      try {
        clearInterval(renewTimer);
      } catch {
        // ignore
      }
    }
    await releaseJobLock(sql as any, { key: lockKey, holderId }).catch(() => void 0);
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
