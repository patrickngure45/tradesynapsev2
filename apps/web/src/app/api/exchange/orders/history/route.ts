import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { requireSessionUserId } from "@/lib/auth/sessionGuard";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { resolveReadOnlyUserScope } from "@/lib/auth/impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/exchange/orders/history
 *
 * Returns full order history with fill details.
 * Query: ?status=open|partially_filled|filled|canceled|all  &market_id=uuid  &limit=100
 */
const querySchema = z.object({
  status: z.enum(["open", "partially_filled", "filled", "canceled", "all"]).optional().default("all"),
  market_id: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.max(1, Math.min(500, Number(v) || 100))),
});

export async function GET(req: Request) {
  const sql = getSql();

  const authed = await requireSessionUserId(sql as any, req);
  if (!authed.ok) return authed.response;
  const actingUserId = authed.userId;

  const scopeRes = await retryOnceOnTransientDbError(() => resolveReadOnlyUserScope(sql, req, actingUserId));
  if (!scopeRes.ok) return apiError(scopeRes.error);
  const userId = scopeRes.scope.userId;

  const url = new URL(req.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      market_id: url.searchParams.get("market_id") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, userId));
    if (activeErr) return apiError(activeErr);

    const orders = await retryOnceOnTransientDbError(async () => {
      return await sql`
      SELECT
        o.id,
        o.market_id,
        m.symbol AS market_symbol,
        o.side,
        o.type,
        o.price::text,
        o.quantity::text,
        o.remaining_quantity::text,
        o.iceberg_display_quantity::text,
        o.iceberg_hidden_remaining::text,
        o.status,
        o.created_at,
        o.updated_at,
        coalesce(
          (SELECT json_agg(json_build_object(
            'id', e.id,
            'price', e.price::text,
            'quantity', e.quantity::text,
            'maker_fee', e.maker_fee_quote::text,
            'taker_fee', e.taker_fee_quote::text,
            'created_at', e.created_at
          ) ORDER BY e.created_at)
          FROM ex_execution e
          WHERE e.maker_order_id = o.id OR e.taker_order_id = o.id),
          '[]'::json
        ) AS fills
      FROM ex_order o
      JOIN ex_market m ON m.id = o.market_id
      WHERE o.user_id = ${userId}::uuid
        AND (${q.status} = 'all' OR o.status = ${q.status})
        AND (${q.market_id ?? null}::uuid IS NULL OR o.market_id = ${q.market_id ?? null}::uuid)
      ORDER BY o.created_at DESC
      LIMIT ${q.limit}
    `;
    });

    return Response.json({ orders });
  } catch (e: unknown) {
    const resp = responseForDbError("exchange.orders.history", e);
    if (resp) return resp;
    console.error("[order-history] Error:", e instanceof Error ? e.message : String(e));
    return apiError("internal_error", { status: 500 });
  }
}
