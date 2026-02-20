import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { ingestNativeBnbDepositTx, scanAndCreditBscDeposits } from "@/lib/blockchain/depositIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InFlight = { startedAtMs: number; id: string };
let inFlight: InFlight | null = null;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function requireCronAuth(req: NextRequest): string | null {
  if (process.env.NODE_ENV !== "production") return null;

  const configured = process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!configured) return "cron_secret_not_configured";

  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!provided || provided !== configured) return "cron_unauthorized";
  return null;
}

export async function POST(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) {
    const status = authErr === "cron_unauthorized" ? 401 : 500;
    return NextResponse.json({ error: authErr }, { status });
  }

  // Prevent overlapping scans in the same Node process (cron retries/timeouts can
  // otherwise pile up and OOM the web service).
  const nowMs = Date.now();
  const lockTtlMs = clampInt(Number(process.env.EXCHANGE_SCAN_LOCK_TTL_MS ?? 10 * 60_000), 30_000, 60 * 60_000);
  if (inFlight && nowMs - inFlight.startedAtMs < lockTtlMs) {
    return NextResponse.json(
      {
        ok: false,
        error: "scan_in_progress",
        started_at: new Date(inFlight.startedAtMs).toISOString(),
        hint: "Another scan is already running; wait for it to finish or increase EXCHANGE_SCAN_LOCK_TTL_MS.",
      },
      { status: 429 },
    );
  }
  const myInFlight: InFlight = { startedAtMs: nowMs, id: crypto.randomUUID() };
  inFlight = myInFlight;

  const sql = getSql();

  const beat = async (details?: Record<string, unknown>) => {
    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "deposit-scan:bsc",
        status: "ok",
        details: { ...(details ?? {}) },
      });
    } catch {
      // ignore
    }
  };

  const url = new URL(req.url);
  const nativeTx = url.searchParams.get("native_tx") ?? url.searchParams.get("tx_hash");
  const fromBlockRaw = url.searchParams.get("from_block");
  const maxBlocksRaw = url.searchParams.get("max_blocks");
  const confirmationsRaw = url.searchParams.get("confirmations");
  const blocksPerBatchRaw = url.searchParams.get("blocks_per_batch");
  const maxMsRaw = url.searchParams.get("max_ms");
  const tokensRaw = url.searchParams.get("tokens");
  const nativeRaw = url.searchParams.get("native");
  const symbolsRaw = url.searchParams.get("symbols");

  const fromBlock = fromBlockRaw ? Number(fromBlockRaw) : undefined;
  // Hard cap request override values; use env vars for bigger backfills.
  const maxBlocks = maxBlocksRaw ? clampInt(Number(maxBlocksRaw), 10, 20_000) : undefined;
  const confirmations = confirmationsRaw ? Number(confirmationsRaw) : undefined;
  const blocksPerBatch = blocksPerBatchRaw ? clampInt(Number(blocksPerBatchRaw), 10, 3_000) : undefined;
  const maxMs = maxMsRaw ? clampInt(Number(maxMsRaw), 1_000, 120_000) : undefined;

  const scanTokensRaw = tokensRaw == null ? undefined : !(tokensRaw.trim() === "0" || tokensRaw.trim().toLowerCase() === "false");
  const scanNative = nativeRaw == null ? undefined : !(nativeRaw.trim() === "0" || nativeRaw.trim().toLowerCase() === "false");

  const tokenSymbols = (symbolsRaw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // Production-safe default: do NOT scan all enabled tokens unless explicitly allowlisted.
  // Token scans can be very expensive (many assets × many addresses × getLogs ranges).
  const allowTokenScanAll = String(process.env.ALLOW_TOKEN_SCAN_ALL ?? "").trim() === "1";

  if (process.env.NODE_ENV === "production" && scanTokensRaw === true && tokenSymbols.length === 0 && !allowTokenScanAll) {
    return NextResponse.json(
      {
        ok: false,
        error: "token_symbols_required",
        hint: "Pass symbols=USDT,USDC (recommended) or set ALLOW_TOKEN_SCAN_ALL=1 to scan all enabled tokens (not recommended).",
      },
      { status: 400 },
    );
  }

  const scanTokens =
    scanTokensRaw ??
    (tokenSymbols.length > 0
      ? true
      : allowTokenScanAll
        ? true
        : false);

  try {
    await beat({ event: "start" });
    if (nativeTx) {
      const out = await ingestNativeBnbDepositTx(sql as any, {
        txHash: nativeTx,
        confirmations: Number.isFinite(confirmations as any) ? (confirmations as number) : undefined,
      });
      await beat({ event: "native_tx", ok: out.ok, tx_hash: nativeTx });
      const status = out.ok ? 200 : out.error === "tx_not_confirmed" ? 202 : 400;
      return NextResponse.json(out, { status });
    }

    const result = await scanAndCreditBscDeposits(sql as any, {
      fromBlock: Number.isFinite(fromBlock as any) ? (fromBlock as number) : undefined,
      maxBlocks: Number.isFinite(maxBlocks as any) ? (maxBlocks as number) : undefined,
      confirmations: Number.isFinite(confirmations as any) ? (confirmations as number) : undefined,
      blocksPerBatch: Number.isFinite(blocksPerBatch as any) ? (blocksPerBatch as number) : undefined,
      maxMs: Number.isFinite(maxMs as any) ? (maxMs as number) : undefined,
      scanTokens,
      scanNative,
      tokenSymbols: tokenSymbols.length ? tokenSymbols : undefined,
    });

    await beat({ event: "done", ...result });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await beat({ event: "error", message });
    return NextResponse.json(
      {
        ok: false,
        error: "scan_failed",
        message,
        hint:
          "Check BSC RPC connectivity (BSC_RPC_URL) and that DATABASE_URL is reachable. See Railway logs for full stack.",
      },
      { status: 500 },
    );
  } finally {
    // Release lock only if we still own it.
    if (inFlight?.id === myInFlight.id) inFlight = null;
  }
}

// Allow simple cron providers that only support GET.
export async function GET(req: NextRequest) {
  return POST(req);
}

