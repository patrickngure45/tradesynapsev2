import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, isParty, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { canOpenDispute } from "@/lib/state/trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openDisputeSchema = z.object({
  opened_by_user_id: z.string().uuid(),
  reason_code: z.enum(["non_payment", "chargeback", "phishing", "other"]),
});

const tradeIdSchema = z.string().uuid();

export async function GET(
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
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() =>
      requireActiveUser(sql, actingUserId)
    );
    if (activeErr) {
      return apiError(activeErr);
    }

    if (actingUserId) {
      const trades = await retryOnceOnTransientDbError(async () => {
        return await sql<{ buyer_user_id: string; seller_user_id: string }[]>`
          SELECT buyer_user_id, seller_user_id
          FROM trade
          WHERE id = ${id}
          LIMIT 1
        `;
      });
      if (trades.length === 0) {
        return apiError("not_found");
      }
      if (!isParty(actingUserId, trades[0]!)) {
        return apiError("not_party");
      }
    }

    const disputes = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        trade_id: string;
        opened_by_user_id: string;
        reason_code: string;
        status: string;
        opened_at: string;
        resolved_at: string | null;
      }[]>`
        SELECT id, trade_id, opened_by_user_id, reason_code, status, opened_at, resolved_at
        FROM dispute
        WHERE trade_id = ${id}
        LIMIT 1
      `;
    });

  const dispute = disputes[0] ?? null;
  if (!dispute) {
    return Response.json({ dispute: null, decisions: [] });
  }

    const decisions = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        dispute_id: string;
        decision: string;
        rationale: string | null;
        decided_by: string;
        created_at: string;
      }[]>`
        SELECT id, dispute_id, decision, rationale, decided_by, created_at
        FROM dispute_decision
        WHERE dispute_id = ${dispute.id}
        ORDER BY created_at ASC
      `;
    });

    return Response.json({ dispute, decisions });
  } catch (e) {
    const resp = responseForDbError("trades.dispute.get", e);
    if (resp) return resp;
    throw e;
  }
}

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

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof openDisputeSchema>;
  try {
    input = openDisputeSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) {
      return apiError(activeErr);
    }
    if (actingUserId && actingUserId !== input.opened_by_user_id) {
      return apiError("x_user_id_mismatch");
    }

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const trades = await txSql<{
      id: string;
      buyer_user_id: string;
      seller_user_id: string;
      status: string;
    }[]>`
      SELECT id, buyer_user_id, seller_user_id, status
      FROM trade
      WHERE id = ${id}
      LIMIT 1
    `;

    if (trades.length === 0) {
      return { status: 404 as const, body: { error: "not_found" } };
    }

    const trade = trades[0]!;

    if (!canOpenDispute(trade.status)) {
      return { status: 409 as const, body: { error: "trade_not_disputable" } };
    }

    if (
      input.opened_by_user_id !== trade.buyer_user_id &&
      input.opened_by_user_id !== trade.seller_user_id
    ) {
      return { status: 403 as const, body: { error: "opened_by_not_party" } };
    }

    const existing = await txSql<{ id: string }[]>`
      SELECT id
      FROM dispute
      WHERE trade_id = ${id}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return { status: 409 as const, body: { error: "dispute_already_exists" } };
    }

    const inserted = await txSql<{
      id: string;
      trade_id: string;
      opened_by_user_id: string;
      reason_code: string;
      status: string;
      opened_at: string;
      resolved_at: string | null;
    }[]>`
      INSERT INTO dispute (
        trade_id,
        opened_by_user_id,
        reason_code,
        status
      ) VALUES (
        ${id},
        ${input.opened_by_user_id},
        ${input.reason_code},
        'open'
      )
      RETURNING id, trade_id, opened_by_user_id, reason_code, status, opened_at, resolved_at
    `;

    if (trade.status !== "disputed") {
      await txSql`
        UPDATE trade
        SET status = 'disputed'
        WHERE id = ${id} AND status = ${trade.status}
      `;

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
          ${trade.status},
          'disputed',
          ${input.opened_by_user_id},
          'user',
          'open_dispute'
        )
      `;
    }

    return {
      status: 201 as const,
      body: { dispute: inserted[0]!, decisions: [] },
    };
    });

    if ("error" in result.body && typeof result.body.error === "string") {
      return apiError(result.body.error, { status: result.status });
    }

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("trades.dispute.open", e);
    if (resp) return resp;
    throw e;
  }
}
