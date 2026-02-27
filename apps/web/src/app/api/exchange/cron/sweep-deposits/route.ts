import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { sweepBscDeposits } from "@/lib/blockchain/sweepDeposits";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { tryAcquireJobLock, releaseJobLock } from "@/lib/system/jobLock";
import { requireCronRequestAuth } from "@/lib/auth/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireEnabledInProd(): string | null {
  if (process.env.NODE_ENV !== "production") return null;

  // Safety default: sweeping touches hot-wallet operations; keep it off unless explicitly enabled.
  const enabled = String(process.env.EXCHANGE_ENABLE_SWEEP_DEPOSITS ?? "").trim();
  if (enabled !== "1" && enabled.toLowerCase() !== "true") return "sweep_deposits_disabled";
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
        hint: "Set EXCHANGE_ENABLE_SWEEP_DEPOSITS=1 in production to enable this endpoint.",
      },
      { status: 403 },
    );
  }

  const sql = getSql();
  const url = new URL(req.url);
  const force = (url.searchParams.get("force") ?? "").trim() === "1";
  const execute = (url.searchParams.get("execute") ?? "").trim() === "1";
  const gasTopups = (url.searchParams.get("gas_topups") ?? "").trim() === "1";
  const tokensParam = (url.searchParams.get("tokens") ?? "").trim();
  const scanTokens = tokensParam === "" ? true : !(tokensParam === "0" || tokensParam.toLowerCase() === "false");
  const tokenSymbolsRaw = (url.searchParams.get("symbols") ?? "").trim();

  // Production safety: sweeping tokens across all enabled assets can be very expensive.
  // Default to a small allowlist unless explicitly overridden via symbols=...
  const defaultSymbols = String(process.env.SWEEP_DEFAULT_SYMBOLS ?? "USDT,USDC,WBNB")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const tokenSymbols = !scanTokens
    ? ([] as string[])
    : tokenSymbolsRaw
      ? tokenSymbolsRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : defaultSymbols;

  const beat = async (details?: Record<string, unknown>, status: "ok" | "degraded" | "error" = "ok") => {
    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "sweep-deposits:bsc",
        status,
        details: { ...(details ?? {}) },
      });
    } catch {
      // ignore
    }
  };

  // Prevent overlapping sweeps across replicas.
  const lockKey = "exchange:sweep-deposits:bsc";
  const holderId = `${process.env.RAILWAY_SERVICE_NAME ?? process.env.SERVICE_NAME ?? "web"}:${crypto.randomUUID()}`;
  const lockTtlMs = Math.max(10_000, Math.min(10 * 60_000, Number(process.env.EXCHANGE_SWEEP_LOCK_TTL_MS ?? 120_000) || 120_000));
  const lock = await tryAcquireJobLock(sql as any, { key: lockKey, holderId, ttlMs: lockTtlMs });
  if (!lock.acquired) {
    await beat({ event: "skipped_locked", held_until: lock.held_until, holder_id: lock.holder_id }, "degraded").catch(() => void 0);
    return NextResponse.json(
      { ok: false, error: "job_in_progress", held_until: lock.held_until, holder_id: lock.holder_id },
      { status: 429 },
    );
  }

  // Cadence gating (optional but recommended): avoid sweeping too frequently.
  const cadenceRaw = String(process.env.SWEEP_CADENCE_MS ?? "").trim();
  const cadenceMs = cadenceRaw ? Math.max(0, Math.min(7 * 24 * 60 * 60_000, Number(cadenceRaw) || 0)) : 0;
  if (!force && cadenceMs > 0) {
    try {
      const rows = await sql<Array<{ last_seen_at: string }>>`
        SELECT last_seen_at::text AS last_seen_at
        FROM app_service_heartbeat
        WHERE service = 'sweep-deposits:bsc'
        LIMIT 1
      `;
      const lastSeen = rows[0]?.last_seen_at ? Date.parse(rows[0]!.last_seen_at) : NaN;
      if (Number.isFinite(lastSeen)) {
        const ageMs = Date.now() - lastSeen;
        if (ageMs >= 0 && ageMs < cadenceMs) {
          await upsertServiceHeartbeat(sql as any, {
            service: "sweep-deposits:bsc",
            status: "ok",
            details: { event: "skipped_cadence", cadence_ms: cadenceMs, age_ms: ageMs },
          }).catch(() => void 0);
          return NextResponse.json({
            ok: true,
            skipped: true,
            reason: "cadence",
            cadence_ms: cadenceMs,
            age_ms: ageMs,
            next_allowed_in_ms: Math.max(0, cadenceMs - ageMs),
          });
        }
      }
    } catch {
      // If cadence gating fails, do not block sweeping.
    }
  }

  try {
    await beat({ event: "start", execute, gas_topups: gasTopups, tokens: scanTokens, symbols: tokenSymbols });
    const result = await sweepBscDeposits(sql as any, {
      execute,
      allowGasTopups: gasTopups,
      tokenSymbols,
    });
    await beat({ event: "done", ...result, execute, gas_topups: gasTopups, symbols: tokenSymbols });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await beat({ event: "error", message, execute, gas_topups: gasTopups, symbols: tokenSymbols }, "error");
    return NextResponse.json(
      {
        ok: false,
        error: "sweep_failed",
        message,
        hint:
          "Check hot wallet key (DEPLOYER_PRIVATE_KEY), master seed (CITADEL_MASTER_SEED), and BSC RPC connectivity (BSC_RPC_URL).",
      },
      { status: 500 },
    );
  } finally {
    try {
      await releaseJobLock(sql as any, { key: lockKey, holderId });
    } catch {
      // ignore
    }
  }
}

// Allow simple cron providers that only support GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
