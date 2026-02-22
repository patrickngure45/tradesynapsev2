import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { enqueueOutbox } from "@/lib/outbox";
import { responseForDbError } from "@/lib/dbTransient";
import { logRouteResponse } from "@/lib/routeLog";
import { canCancelOrder } from "@/lib/state/order";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { createPgRateLimiter } from "@/lib/rateLimitPg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startMs = Date.now();
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

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    // Optional per-user cancel rate limit (prevents terminal cancel spam).
    const cancelMax = Number(String(process.env.EXCHANGE_CANCEL_MAX_PER_MIN ?? "").trim() || "0");
    if (Number.isFinite(cancelMax) && cancelMax > 0) {
      try {
        const limiter = createPgRateLimiter(sql as any, { name: "exchange-cancel", windowMs: 60_000, max: Math.trunc(cancelMax) });
        const rl = await limiter.consume(`u:${actingUserId}`);
        if (!rl.allowed) return apiError("rate_limit_exceeded", { status: 429 });
      } catch {
        // If limiter fails, do not block cancels.
      }
    }

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const rows = await txSql<
      { id: string; user_id: string; market_id: string; status: string; hold_id: string | null }[]
    >`
      SELECT id, user_id, market_id, status, hold_id
      FROM ex_order
      WHERE id = ${id}::uuid
      LIMIT 1
      FOR UPDATE
    `;

    if (rows.length === 0) return { status: 404 as const, body: { error: "order_not_found" } };
    const o = rows[0]!;
    if (o.user_id !== actingUserId) return { status: 403 as const, body: { error: "actor_not_allowed" } };

    if (!canCancelOrder(o.status)) {
      return { status: 409 as const, body: { error: "order_state_conflict" } };
    }

    // Serialize within market so cancel doesn't race match.
    await txSql`SELECT pg_advisory_xact_lock(hashtext(${o.market_id}::text))`;

    await txSql`
      UPDATE ex_order
      SET status = 'canceled', updated_at = now()
      WHERE id = ${id}::uuid
        AND status IN ('open','partially_filled')
    `;

    if (o.hold_id) {
      await txSql`
        UPDATE ex_hold
        SET status = 'released', released_at = now()
        WHERE id = ${o.hold_id}::uuid AND status = 'active'
      `;
    }

    await enqueueOutbox(txSql, {
      topic: "ex.order.canceled",
      aggregate_type: "order",
      aggregate_id: o.id,
      payload: {
        order_id: o.id,
        user_id: o.user_id,
        market_id: o.market_id,
        hold_id: o.hold_id,
        status: "canceled",
      },
    });

      return { status: 200 as const, body: { ok: true, order_id: id } };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    const response = Response.json(result.body, { status: result.status });
    logRouteResponse(request, response, { startMs, userId: actingUserId, meta: { orderId: id } });

    try {
      if (result.status === 200) {
        await writeAuditLog(sql, {
          actorId: actingUserId,
          actorType: "user",
          action: "order.canceled",
          resourceType: "order",
          resourceId: id,
          ...auditContextFromRequest(request),
        });
      }
    } catch { /* audit log failure must not block the response */ }

    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.orders.cancel", e);
    if (resp) return resp;
    throw e;
  }
}
