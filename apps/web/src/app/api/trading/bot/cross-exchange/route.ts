import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

const startSchema = z.object({
  fromExchange: z.string().min(1),
  toExchange: z.string().min(1),
  symbol: z.string().min(1),
  amount: z.number().positive(),
  mode: z.enum(["simulation", "live"]).optional().default("simulation"),
});

/**
 * POST /api/trading/bot/cross-exchange
 *
 * Cross-exchange bots require >= 2 active connections.
 * This endpoint is wired for gating now; execution logic can be added later.
 */
export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof startSchema>;
    try {
      input = startSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const fromExchange = input.fromExchange.trim().toLowerCase();
    const toExchange = input.toExchange.trim().toLowerCase();
    if (fromExchange === toExchange) {
      return Response.json({ error: "same_exchange", message: "fromExchange and toExchange must be different." }, { status: 400 });
    }

    const conns = await sql<Array<{ exchange: string }>>`
      SELECT exchange
      FROM user_exchange_connection
      WHERE user_id = ${actingUserId} AND status = 'active'
        AND exchange = ANY(${[fromExchange, toExchange]})
    `;
    const have = new Set(conns.map((c) => String(c.exchange).toLowerCase()));
    if (!have.has(fromExchange) || !have.has(toExchange)) {
      return Response.json(
        {
          error: "missing_connections",
          message: "Please connect both exchanges before starting a cross-exchange bot.",
        },
        { status: 400 },
      );
    }

    if (input.mode === "live") {
      return Response.json(
        {
          error: "live_not_supported",
          message: "Cross-exchange live execution is not supported yet. Use simulation mode.",
        },
        { status: 403 },
      );
    }

    const params = {
      fromExchange,
      toExchange,
      symbol: input.symbol,
      amount: input.amount,
      mode: "simulation",
    };

    const [exec] = await sql`
      INSERT INTO trading_bot_execution (user_id, kind, status, signal_id, exchange, symbol, amount_usd, leverage, params_json, result_json, finished_at)
      VALUES (
        ${actingUserId}::uuid,
        'cross_exchange',
        'succeeded',
        NULL,
        ${fromExchange},
        ${input.symbol},
        NULL,
        1,
        ${JSON.stringify(params)}::jsonb,
        ${JSON.stringify({ mode: "simulation", note: "Simulation-only: no orders were placed.", params })}::jsonb,
        now()
      )
      RETURNING id
    `;

    const auditCtx = auditContextFromRequest(request);
    await writeAuditLog(sql, {
      actorId: actingUserId,
      actorType: "user",
      action: "trading.bot.cross_exchange.simulated",
      resourceType: "trading_bot_execution",
      resourceId: String(exec.id),
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent,
      requestId: auditCtx.requestId,
      detail: params,
    });

    return Response.json({
      success: true,
      mode: "simulation",
      executionId: exec.id,
      message: "Cross-exchange bot recorded (simulation-only). No orders were placed.",
    });
  } catch (e) {
    return responseForDbError("trading.bot.cross_exchange", e) ?? apiError("internal_error");
  }
}

