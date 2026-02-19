import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { ingestNativeBnbDepositTx, scanAndCreditBscDeposits } from "@/lib/blockchain/depositIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const tokensRaw = url.searchParams.get("tokens");
  const nativeRaw = url.searchParams.get("native");
  const symbolsRaw = url.searchParams.get("symbols");

  const fromBlock = fromBlockRaw ? Number(fromBlockRaw) : undefined;
  const maxBlocks = maxBlocksRaw ? Number(maxBlocksRaw) : undefined;
  const confirmations = confirmationsRaw ? Number(confirmationsRaw) : undefined;
  const blocksPerBatch = blocksPerBatchRaw ? Number(blocksPerBatchRaw) : undefined;

  const scanTokens = tokensRaw == null ? undefined : !(tokensRaw.trim() === "0" || tokensRaw.trim().toLowerCase() === "false");
  const scanNative = nativeRaw == null ? undefined : !(nativeRaw.trim() === "0" || nativeRaw.trim().toLowerCase() === "false");

  const tokenSymbols = (symbolsRaw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

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
  }
}

// Allow simple cron providers that only support GET.
export async function GET(req: NextRequest) {
  return POST(req);
}

