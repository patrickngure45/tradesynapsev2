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
          asset_id: string;
          chain: string;
          symbol: string;
          decimals: number;
          posted: string;
          held: string;
          available: string;
        }[]
      >`
        WITH accounts AS (
          SELECT id, asset_id
          FROM ex_ledger_account
          WHERE user_id = ${actingUserId}
        ),
        posted AS (
          SELECT a.asset_id, coalesce(sum(j.amount), 0)::text AS posted
          FROM accounts a
          LEFT JOIN ex_journal_line j ON j.account_id = a.id
          GROUP BY a.asset_id
        ),
        held AS (
          SELECT a.asset_id, coalesce(sum(h.remaining_amount), 0)::text AS held
          FROM accounts a
          LEFT JOIN ex_hold h ON h.account_id = a.id AND h.status = 'active'
          GROUP BY a.asset_id
        )
        SELECT
          asset.id AS asset_id,
          asset.chain,
          asset.symbol,
          asset.decimals,
          coalesce(posted.posted, '0') AS posted,
          coalesce(held.held, '0') AS held,
          (coalesce(posted.posted, '0')::numeric - coalesce(held.held, '0')::numeric)::text AS available
        FROM ex_asset asset
        LEFT JOIN posted ON posted.asset_id = asset.id
        LEFT JOIN held ON held.asset_id = asset.id
        WHERE asset.is_enabled = true
        ORDER BY asset.chain ASC, asset.symbol ASC
      `;
    });

    const response = Response.json({ user_id: actingUserId, balances: rows });
    logRouteResponse(request, response, { startMs, userId: actingUserId });
    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.balances.list", e);
    if (resp) return resp;
    throw e;
  }
}
