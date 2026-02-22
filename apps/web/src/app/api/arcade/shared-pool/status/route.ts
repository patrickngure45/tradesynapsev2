import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULE_KEY = "shared_pool";

function utcDateIso(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

function weekStartIso(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay();
  const daysSinceMon = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMon);
  return utcDateIso(d);
}

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();
  const weekStart = weekStartIso(new Date());

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<
        Array<{ action_id: string; status: string; outcome_json: any; requested_at: string }>
      >`
        SELECT
          a.id::text AS action_id,
          a.status,
          a.outcome_json,
          a.requested_at::text AS requested_at
        FROM arcade_daily_claim c
        JOIN arcade_action a ON a.id = c.action_id
        WHERE c.user_id = ${actingUserId}::uuid
          AND c.module = ${MODULE_KEY}
          AND c.claim_date = ${weekStart}::date
        LIMIT 1
      `;

      const row = rows[0];
      if (!row) {
        return { participated: false, action_id: null as string | null, action_status: null as string | null, outcome: null as any };
      }

      return {
        participated: true,
        action_id: row.action_id,
        action_status: row.status,
        outcome: row.outcome_json ?? null,
      };
    });

    return Response.json(
      {
        ok: true,
        module: MODULE_KEY,
        week_start: weekStart,
        participated: out.participated,
        action_id: out.action_id,
        action_status: out.action_status,
        outcome: out.outcome,
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_shared_pool_status", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
