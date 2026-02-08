import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const holdIdSchema = z.string().uuid();

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sql = getSql();
  const { id } = await params;

  try {
    holdIdSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const holds = await txSql<
      {
        id: string;
        account_id: string;
        status: string;
      }[]
    >`
      SELECT id, account_id, status
      FROM ex_hold
      WHERE id = ${id}
      LIMIT 1
    `;

    if (holds.length === 0) {
      return { status: 404 as const, body: { error: "not_found" } };
    }

    const accountId = holds[0]!.account_id;

    const accounts = await txSql<{ user_id: string }[]>`
      SELECT user_id
      FROM ex_ledger_account
      WHERE id = ${accountId}
      LIMIT 1
    `;

    if (accounts.length === 0) {
      return { status: 404 as const, body: { error: "not_found" } };
    }

    if (accounts[0]!.user_id !== actingUserId) {
      return { status: 403 as const, body: { error: "actor_not_allowed" } };
    }

    if (holds[0]!.status !== "active") {
      return { status: 409 as const, body: { error: "trade_state_conflict" } };
    }

    const updated = await txSql<{ id: string }[]>`
      UPDATE ex_hold
      SET status = 'released', released_at = now()
      WHERE id = ${id} AND status = 'active'
      RETURNING id
    `;

    if (updated.length === 0) {
      return { status: 409 as const, body: { error: "trade_state_conflict" } };
    }

    return { status: 200 as const, body: { ok: true, hold_id: id } };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("exchange.holds.release", e);
    if (resp) return resp;
    throw e;
  }
}
