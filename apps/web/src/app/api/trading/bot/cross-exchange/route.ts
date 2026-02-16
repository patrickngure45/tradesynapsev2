import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";

// Placeholder schema for future cross-exchange bots.
// Intentionally minimal: we only need the gate + a safe response for now.
const startSchema = z.object({
  fromExchange: z.string().min(1),
  toExchange: z.string().min(1),
  symbol: z.string().min(1),
  amount: z.number().positive(),
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

    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM user_exchange_connection
      WHERE user_id = ${actingUserId} AND status = 'active'
    `;

    if ((count ?? 0) < 2) {
      return Response.json(
        {
          error: "need_two_connections",
          message: "Cross-exchange bots require at least 2 active exchange connections.",
        },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    try {
      startSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    return Response.json(
      {
        error: "not_implemented",
        message: "Cross-exchange bot execution is not implemented yet. Gating is enforced.",
      },
      { status: 501 },
    );
  } catch (e) {
    return responseForDbError("trading.bot.cross_exchange", e) ?? apiError("internal_error");
  }
}
