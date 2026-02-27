import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { finalizePendingBscDeposits } from "@/lib/blockchain/depositIngest";
import { tryAcquireJobLock, renewJobLock, releaseJobLock } from "@/lib/system/jobLock";
import { requireCronRequestAuth } from "@/lib/auth/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function requireEnabledInProd(): string | null {
  if (process.env.NODE_ENV !== "production") return null;

  // Tie finalization to the same safety switch as deposit scanning.
  const enabled = String(process.env.EXCHANGE_ENABLE_DEPOSIT_SCAN ?? "").trim();
  if (enabled !== "1" && enabled.toLowerCase() !== "true") return "deposit_scan_disabled";
  return null;
}

export async function POST(req: NextRequest) {
  const authErr = requireCronRequestAuth(req);
  if (authErr) {
    const status = authErr === "cron_unauthorized" ? 401 : 500;
    return NextResponse.json({ error: authErr }, { status });
  }

  const enabledErr = requireEnabledInProd();
  if (enabledErr) {
    return NextResponse.json(
      {
        ok: false,
        error: enabledErr,
        hint: "Set EXCHANGE_ENABLE_DEPOSIT_SCAN=1 in production to enable this endpoint.",
      },
      { status: 403 },
    );
  }

  const sql = getSql();
  const url = new URL(req.url);

  const max = clampInt(Number(url.searchParams.get("max") ?? "250"), 1, 2000);
  const maxMs = clampInt(Number(url.searchParams.get("max_ms") ?? "0"), 0, 60_000);
  const confirmations = clampInt(Number(url.searchParams.get("confirmations") ?? ""), 0, 200);
  const confirmationsOpt = Number.isFinite(confirmations) ? confirmations : undefined;

  const lockTtlMs = clampInt(Number(process.env.EXCHANGE_FINALIZE_LOCK_TTL_MS ?? 60_000), 10_000, 10 * 60_000);
  const lockKey = "exchange:finalize-deposits:bsc";
  const holderId = `${process.env.RAILWAY_SERVICE_NAME ?? process.env.SERVICE_NAME ?? "web"}:${crypto.randomUUID()}`;

  const lock = await tryAcquireJobLock(sql as any, { key: lockKey, holderId, ttlMs: lockTtlMs });
  if (!lock.acquired) {
    return NextResponse.json(
      {
        ok: false,
        error: "finalize_in_progress",
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
      renewJobLock(sql as any, { key: lockKey, holderId, ttlMs: lockTtlMs }).catch(() => void 0);
    }, renewEveryMs);
  } catch {
    // ignore
  }

  const beat = async (details?: Record<string, unknown>) => {
    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "deposit-finalize:bsc",
        status: "ok",
        details: { ...(details ?? {}) },
      });
    } catch {
      // ignore
    }
  };

  try {
    await beat({ event: "start", max, max_ms: maxMs, confirmations: confirmationsOpt ?? null });
    const result = await finalizePendingBscDeposits(sql as any, {
      max,
      maxMs: maxMs > 0 ? maxMs : undefined,
      confirmations: confirmationsOpt,
    });
    await beat({ event: "done", ...result });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await beat({ event: "error", message }).catch(() => void 0);
    return NextResponse.json({ ok: false, error: "finalize_failed", message }, { status: 500 });
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
