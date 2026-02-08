import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { requireAdmin } from "@/lib/auth/admin";
import { logRouteResponse } from "@/lib/routeLog";

const VALID_STATUSES = new Set(["requested", "needs_review", "approved", "rejected", "completed", "failed", "review"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startMs = Date.now();
  const sql = getSql();
  const admin = await requireAdmin(sql, request);
  if (!admin.ok) return apiError(admin.error);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "requested";
  if (!VALID_STATUSES.has(status)) return apiError("invalid_input");
  const statusList =
    status === "review" ? (["requested", "needs_review"] as const) : null;

  try {
    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          user_id: string;
          asset_id: string;
          symbol: string;
          chain: string;
          amount: string;
          destination_address: string;
          status: string;
          hold_id: string | null;
          reference: string | null;
          risk_score: number | null;
          risk_recommended_action: string | null;
          risk_model_version: string | null;
          risk_created_at: string | null;
          created_at: string;
          updated_at: string;
        }[]
      >`
        SELECT
          w.id,
          w.user_id,
          w.asset_id,
          a.symbol,
          a.chain,
          w.amount::text AS amount,
          w.destination_address,
          w.status,
          w.hold_id,
          w.reference,
          s.score::int AS risk_score,
          s.recommended_action AS risk_recommended_action,
          s.model_version AS risk_model_version,
          s.created_at AS risk_created_at,
          w.created_at,
          w.updated_at
        FROM ex_withdrawal_request w
        JOIN ex_asset a ON a.id = w.asset_id
        LEFT JOIN LATERAL (
          SELECT score, recommended_action, model_version, created_at
          FROM app_signal
          WHERE subject_type = 'withdrawal'
            AND subject_id = w.id::text
            AND kind = 'risk_assessment'
          ORDER BY created_at DESC
          LIMIT 1
        ) s ON true
        WHERE (
          (${statusList}::text[] IS NOT NULL AND w.status = ANY(${statusList}::text[]))
          OR (${statusList}::text[] IS NULL AND w.status = ${status})
        )
        ORDER BY w.created_at ASC
        LIMIT 200
      `;
    });

    const response = Response.json({ withdrawals: rows });
    logRouteResponse(request, response, { startMs, meta: { status } });
    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.admin.withdrawals.list", e);
    if (resp) return resp;
    throw e;
  }
}
