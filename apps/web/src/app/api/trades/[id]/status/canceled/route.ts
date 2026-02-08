import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, isParty, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { canTransitionTrade } from "@/lib/state/trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tradeIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sql = getSql();
  const { id } = await params;

  try {
    tradeIdSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const actingUserId = getActingUserId(request);
  if (!actingUserId) return apiError("missing_x_user_id");
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const trades = await txSql<
      {
        buyer_user_id: string;
        seller_user_id: string;
        status: string;
      }[]
    >`
      SELECT buyer_user_id, seller_user_id, status
      FROM trade
      WHERE id = ${id}
      LIMIT 1
    `;

    if (trades.length === 0) {
      return { status: 404 as const, body: { error: "trade_not_found" } };
    }

    const trade = trades[0]!;

    if (!isParty(actingUserId, trade)) {
      return { status: 403 as const, body: { error: "not_party" } };
    }

    const from = trade.status;
    const to = "canceled" as const;

    if (!canTransitionTrade(from, to)) {
      return {
        status: 409 as const,
        body: { error: "trade_transition_not_allowed", details: { from, to } },
      };
    }

    const updated = await txSql<{ id: string }[]>`
      UPDATE trade
      SET status = ${to}, canceled_at = now()
      WHERE id = ${id} AND status = ${from}
      RETURNING id
    `;

    if (updated.length === 0) {
      return { status: 409 as const, body: { error: "trade_state_conflict" } };
    }

    await txSql`
      INSERT INTO trade_state_transition (
        trade_id,
        from_status,
        to_status,
        actor_user_id,
        actor_type,
        reason_code
      ) VALUES (
        ${id},
        ${from},
        ${to},
        ${actingUserId},
        'user',
        'status:canceled'
      )
    `;

    return { status: 201 as const, body: { ok: true, trade_id: id, from_status: from, to_status: to } };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("trades.status.canceled", e);
    if (resp) return resp;
    throw e;
  }
}
