import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { logRouteResponse } from "@/lib/routeLog";
import { resolveReadOnlyUserScope } from "@/lib/auth/impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startMs = Date.now();
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const scopeRes = await retryOnceOnTransientDbError(() => resolveReadOnlyUserScope(sql, request, actingUserId));
  if (!scopeRes.ok) return apiError(scopeRes.error);
  const userId = scopeRes.scope.userId;

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, userId));
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
          WHERE user_id = ${userId}
        )
        SELECT
          asset.id AS asset_id,
          asset.chain,
          asset.symbol,
          asset.decimals,
          p.posted::text AS posted,
          h.held::text AS held,
          (p.posted - h.held)::text AS available
        FROM accounts a
        JOIN ex_asset asset ON asset.id = a.asset_id
        LEFT JOIN LATERAL (
          SELECT coalesce(sum(j.amount), 0)::numeric AS posted
          FROM ex_journal_line j
          WHERE j.account_id = a.id
        ) p ON true
        LEFT JOIN LATERAL (
          SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
          FROM ex_hold
          WHERE account_id = a.id AND status = 'active'
        ) h ON true
        WHERE (p.posted <> 0) OR (h.held <> 0)
        ORDER BY asset.chain ASC, asset.symbol ASC
      `;
    });

    const response = Response.json({ user_id: userId, balances: rows });
    logRouteResponse(request, response, {
      startMs,
      userId: actingUserId,
      meta: scopeRes.scope.impersonating ? { impersonate_user_id: userId } : undefined,
    });
    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.balances.list", e);
    if (resp) return resp;
    throw e;
  }
}
