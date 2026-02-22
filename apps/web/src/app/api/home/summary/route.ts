import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  lookback_days: z
    .string()
    .optional()
    .transform((v) => (v == null ? 30 : Math.max(1, Math.min(365, Number(v) || 30)))),
});

/**
 * GET /api/home/summary
 * Lightweight counts for the /home dashboard.
 */
export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({ lookback_days: url.searchParams.get("lookback_days") ?? undefined });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const lookback = `${q.lookback_days} days`;
    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          open_orders: number;
          pending_withdrawals: number;
          active_p2p_orders: number;
        }[]
      >`
        SELECT
          (
            SELECT count(*)::int
            FROM ex_order
            WHERE user_id = ${actingUserId}::uuid
              AND status IN ('open','partially_filled')
              AND created_at >= now() - ${lookback}::interval
          ) AS open_orders,
          (
            SELECT count(*)::int
            FROM ex_withdrawal_request
            WHERE user_id = ${actingUserId}::uuid
              AND status IN ('requested','approved','broadcasted')
              AND created_at >= now() - ${lookback}::interval
          ) AS pending_withdrawals,
          (
            SELECT count(*)::int
            FROM p2p_order
            WHERE (buyer_id = ${actingUserId}::uuid OR seller_id = ${actingUserId}::uuid)
              AND status IN ('created','paid_confirmed','disputed')
              AND created_at >= now() - ${lookback}::interval
          ) AS active_p2p_orders
      `;
    });

    const row = rows[0] ?? { open_orders: 0, pending_withdrawals: 0, active_p2p_orders: 0 };
    return Response.json({
      ok: true,
      lookback_days: q.lookback_days,
      open_orders: row.open_orders ?? 0,
      pending_withdrawals: row.pending_withdrawals ?? 0,
      active_p2p_orders: row.active_p2p_orders ?? 0,
    });
  } catch (e) {
    const resp = responseForDbError("home.summary", e);
    if (resp) return resp;
    throw e;
  }
}
