import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startMs = Date.now();
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          asset_id: string;
          symbol: string;
          chain: string;
          amount: string;
          destination_address: string;
          status: string;
          hold_id: string | null;
          reference: string | null;
          tx_hash: string | null;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
          approved_by: string | null;
          approved_at: string | null;
          priority_until: string | null;
          priority_boost_code: string | null;
        }[]
      >`
        SELECT
          w.id,
          w.asset_id,
          a.symbol,
          a.chain,
          w.amount::text AS amount,
          w.destination_address,
          w.status,
          w.hold_id,
          w.reference,
          w.tx_hash,
          w.failure_reason,
          w.created_at,
          w.updated_at,
          w.approved_by,
          w.approved_at,
          w.priority_until,
          w.priority_boost_code
        FROM ex_withdrawal_request w
        JOIN ex_asset a ON a.id = w.asset_id
        WHERE w.user_id = ${actingUserId}
        ORDER BY w.created_at DESC
        LIMIT 100
      `;
    });

    const response = Response.json({ user_id: actingUserId, withdrawals: rows });
    logRouteResponse(request, response, { startMs, userId: actingUserId });
    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.list", e);
    if (resp) return resp;
    throw e;
  }
}
