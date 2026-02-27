
import { z } from "zod";
import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

const executeSchema = z.object({
  signalId: z.string().uuid(),
  amount: z.number().min(10), // Min $10
  leverage: z.number().min(1).max(5).default(1),
  mode: z.enum(["simulation", "live"]).default("simulation"),
});

function liveTradingEnabled(): boolean {
  return process.env.TRADING_LIVE_ENABLED === "1";
}

export async function POST(request: Request): Promise<Response> {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "trading.bot.execute",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof executeSchema>;
    try {
      input = executeSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    // 1. Fetch the Signal to verify details
    const [signal] = await sql`
        SELECT * FROM app_signal WHERE id = ${input.signalId}
    `;
    if (!signal) return apiError("not_found", { details: "Signal not found" });

    const { exchange, symbol } = signal.payload_json;

    if (input.mode === "live" && !liveTradingEnabled()) {
      return Response.json(
        {
          error: "live_trading_disabled",
          message: "Live trading is disabled. This environment only supports simulation mode.",
        },
        { status: 403 },
      );
    }

    // 2. Fetch User Connection
    const [connection] = await sql`
        SELECT * FROM user_exchange_connection 
        WHERE user_id = ${actingUserId} AND exchange = ${exchange} AND status = 'active'
        LIMIT 1
    `;

    if (!connection) {
        return Response.json(
            { error: "no_connection", message: `Please connect your ${exchange} account first.` },
            { status: 400 }
        );
    }

    // 3. Create an execution record + enqueue an outbox job.
    // Execution is simulation-only by default; a worker performs checks asynchronously.

    const params = {
      exchange,
      symbol,
      amountUsd: input.amount,
      leverage: input.leverage,
      mode: input.mode,
    };

    const [exec] = await sql`
      INSERT INTO trading_bot_execution (user_id, kind, status, signal_id, exchange, symbol, amount_usd, leverage, params_json)
      VALUES (
        ${actingUserId}::uuid,
        'cash_and_carry',
        'queued',
        ${input.signalId}::uuid,
        ${exchange},
        ${symbol},
        ${input.amount},
        ${input.leverage},
        ${JSON.stringify(params)}::jsonb
      )
      RETURNING id
    `;

    await sql`
      INSERT INTO app_outbox_event (topic, aggregate_type, aggregate_id, payload_json)
      VALUES (
        'trading.bot.execute',
        'trading_bot_execution',
        ${String(exec.id)},
        ${JSON.stringify({ execution_id: String(exec.id) })}::jsonb
      )
    `;

    const auditCtx = auditContextFromRequest(request);
    await writeAuditLog(sql, {
      actorId: actingUserId,
      actorType: "user",
      action: "trading.bot.enqueue",
      resourceType: "trading_bot_execution",
      resourceId: String(exec.id),
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent,
      requestId: auditCtx.requestId,
      detail: {
        signal_id: input.signalId,
        exchange,
        symbol,
        amount: input.amount,
        leverage: input.leverage,
      },
    });

    return Response.json({
      success: true,
      message: `Bot queued (${input.mode}). Checks running in background for ${exchange}.`,
      executionId: exec.id,
    });

  } catch (e) {
    return responseForDbError("trading.bot.execute", e) ?? apiError("internal_error");
  }
}
