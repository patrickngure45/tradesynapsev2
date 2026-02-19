import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
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

  const url = new URL(req.url);
  const nativeTx = url.searchParams.get("native_tx") ?? url.searchParams.get("tx_hash");
  const fromBlockRaw = url.searchParams.get("from_block");
  const maxBlocksRaw = url.searchParams.get("max_blocks");
  const confirmationsRaw = url.searchParams.get("confirmations");
  const blocksPerBatchRaw = url.searchParams.get("blocks_per_batch");

  const fromBlock = fromBlockRaw ? Number(fromBlockRaw) : undefined;
  const maxBlocks = maxBlocksRaw ? Number(maxBlocksRaw) : undefined;
  const confirmations = confirmationsRaw ? Number(confirmationsRaw) : undefined;
  const blocksPerBatch = blocksPerBatchRaw ? Number(blocksPerBatchRaw) : undefined;

  try {
    if (nativeTx) {
      const out = await ingestNativeBnbDepositTx(sql as any, {
        txHash: nativeTx,
        confirmations: Number.isFinite(confirmations as any) ? (confirmations as number) : undefined,
      });
      const status = out.ok ? 200 : out.error === "tx_not_confirmed" ? 202 : 400;
      return NextResponse.json(out, { status });
    }

    const result = await scanAndCreditBscDeposits(sql as any, {
      fromBlock: Number.isFinite(fromBlock as any) ? (fromBlock as number) : undefined,
      maxBlocks: Number.isFinite(maxBlocks as any) ? (maxBlocks as number) : undefined,
      confirmations: Number.isFinite(confirmations as any) ? (confirmations as number) : undefined,
      blocksPerBatch: Number.isFinite(blocksPerBatch as any) ? (blocksPerBatch as number) : undefined,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
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
