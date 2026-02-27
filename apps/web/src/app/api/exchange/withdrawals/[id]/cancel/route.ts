import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sql = getSql();
  const { id } = await params;

  try {
    idSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "exchange.withdrawals.cancel",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const rows = await txSql<
      { id: string; user_id: string; status: string; hold_id: string | null }[]
    >`
      SELECT id, user_id, status, hold_id
      FROM ex_withdrawal_request
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) return { status: 404 as const, body: { error: "not_found" } };
    const w = rows[0]!;
    if (w.user_id !== actingUserId) return { status: 403 as const, body: { error: "actor_not_allowed" } };

    if (w.status !== "requested") {
      return { status: 409 as const, body: { error: "trade_state_conflict" } };
    }

    await txSql`
      UPDATE ex_withdrawal_request
      SET status = 'canceled', updated_at = now()
      WHERE id = ${id} AND status = 'requested'
    `;

    if (w.hold_id) {
      await txSql`
        UPDATE ex_hold
        SET status = 'released', released_at = now()
        WHERE id = ${w.hold_id} AND status = 'active'
      `;
    }

      return { status: 200 as const, body: { ok: true, withdrawal_id: id } };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.cancel", e);
    if (resp) return resp;
    throw e;
  }
}
