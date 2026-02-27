import { assessExchangeWithdrawalRiskV0 } from "@/lib/risk/exchange";
import { getSql } from "@/lib/db";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/risk-simulate
 *
 * Runs the withdrawal risk engine on arbitrary inputs (educational/advisory only).
 * No auth required — this is a read-only simulation.
 */
export async function POST(request: Request) {
  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "ai.risk_simulate",
    windowMs: 60_000,
    max: 30,
    includeIp: true,
  });
  if (rateLimitRes) return rateLimitRes;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const input = {
    amount: String(body.amount ?? "0"),
    available_amount: body.available_amount != null ? String(body.available_amount) : null,
    asset_symbol: body.asset_symbol != null ? String(body.asset_symbol) : null,
    destination_address: body.destination_address != null ? String(body.destination_address) : null,
    allowlist_age_minutes: typeof body.allowlist_age_minutes === "number" ? body.allowlist_age_minutes : null,
    user_withdrawals_1h: typeof body.user_withdrawals_1h === "number" ? body.user_withdrawals_1h : null,
    user_withdrawals_24h: typeof body.user_withdrawals_24h === "number" ? body.user_withdrawals_24h : null,
  };

  const result = assessExchangeWithdrawalRiskV0(input);

  return Response.json(result);
}
