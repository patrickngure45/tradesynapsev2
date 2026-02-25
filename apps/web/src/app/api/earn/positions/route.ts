import { apiError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export async function GET(request: Request) {
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
          status: string;
          kind: string;
          principal_amount: string;
          apr_bps: number;
          lock_days: number | null;
          started_at: string;
          ends_at: string | null;
          last_claim_at: string | null;
          hold_id: string | null;
          closed_at: string | null;
          product_id: string;
          asset_symbol: string;
          asset_decimals: number;
          claimable_interest: string;
          can_redeem: boolean;
        }[]
      >`
        SELECT
          pos.id::text AS id,
          pos.status,
          pos.kind,
          pos.principal_amount::text AS principal_amount,
          pos.apr_bps,
          pos.lock_days,
          pos.started_at::text AS started_at,
          pos.ends_at::text AS ends_at,
          pos.last_claim_at::text AS last_claim_at,
          pos.hold_id::text AS hold_id,
          pos.closed_at::text AS closed_at,
          pos.product_id::text AS product_id,
          a.symbol AS asset_symbol,
          a.decimals AS asset_decimals,
          (
            pos.principal_amount
              * (pos.apr_bps::numeric / 10000)
              * (greatest(0, extract(epoch from (now() - coalesce(pos.last_claim_at, pos.started_at))))::numeric / ${SECONDS_PER_YEAR}::numeric)
          )::numeric(38,18)::text AS claimable_interest,
          (
            pos.status = 'active'
            AND (
              pos.kind = 'flexible'
              OR (pos.kind = 'locked' AND pos.ends_at IS NOT NULL AND now() >= pos.ends_at)
            )
          ) AS can_redeem
        FROM earn_position pos
        JOIN earn_product p ON p.id = pos.product_id
        JOIN ex_asset a ON a.id = p.asset_id
        WHERE pos.user_id = ${actingUserId}::uuid
        ORDER BY pos.created_at DESC
        LIMIT 200
      `;
    });

    return Response.json({ ok: true, positions: rows }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("earn.positions.list", e);
    if (resp) return resp;
    throw e;
  }
}
