import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { sweepBscDeposits } from "@/lib/blockchain/sweepDeposits";

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
  const execute = (url.searchParams.get("execute") ?? "").trim() === "1";
  const gasTopups = (url.searchParams.get("gas_topups") ?? "").trim() === "1";
  const tokenSymbolsRaw = (url.searchParams.get("symbols") ?? "").trim();
  const tokenSymbols = tokenSymbolsRaw
    ? tokenSymbolsRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : undefined;

  try {
    const result = await sweepBscDeposits(sql as any, {
      execute,
      allowGasTopups: gasTopups,
      tokenSymbols,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
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
  }
}

// Allow simple cron providers that only support GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
