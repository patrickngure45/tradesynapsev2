import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { sweepBscDeposits } from "@/lib/blockchain/sweepDeposits";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";

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

function requireEnabledInProd(): string | null {
  if (process.env.NODE_ENV !== "production") return null;

  // Safety default: sweeping touches hot-wallet operations; keep it off unless explicitly enabled.
  const enabled = String(process.env.EXCHANGE_ENABLE_SWEEP_DEPOSITS ?? "").trim();
  if (enabled !== "1" && enabled.toLowerCase() !== "true") return "sweep_deposits_disabled";
  return null;
}

export async function POST(req: NextRequest) {
  const authErr = requireCronAuth(req);
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
