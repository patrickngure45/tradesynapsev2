import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function utcDateIso(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();
  const moduleKey = "calendar_daily";

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      const now = new Date();
      const todayIso = utcDateIso(now);

      const [state] = await sql<
        {
          streak_count: number;
          best_streak: number;
          last_claim_date: string | null;
          pity_rare: number;
        }[]
      >`
        SELECT streak_count, best_streak, last_claim_date::text AS last_claim_date, pity_rare
        FROM arcade_calendar_state
        WHERE user_id = ${actingUserId}::uuid AND module = ${moduleKey}
        LIMIT 1
      `;

      const claimed7d = await sql<{ claim_date: string }[]>`
        SELECT claim_date::text AS claim_date
        FROM arcade_daily_claim
        WHERE user_id = ${actingUserId}::uuid
          AND module = ${moduleKey}
          AND claim_date >= (${todayIso}::date - interval '6 days')
        ORDER BY claim_date ASC
      `;

      const [claimedToday] = await sql<{ ok: boolean }[]>`
        SELECT EXISTS(
          SELECT 1
          FROM arcade_daily_claim
          WHERE user_id = ${actingUserId}::uuid AND module = ${moduleKey} AND claim_date = ${todayIso}::date
        ) AS ok
      `;

      return {
        module: moduleKey,
        today: todayIso,
        claimed_today: Boolean(claimedToday?.ok),
        streak: {
          count: Number(state?.streak_count ?? 0),
          best: Number(state?.best_streak ?? 0),
          last_claim_date: state?.last_claim_date ?? null,
        },
        pity: {
          rare: Number(state?.pity_rare ?? 0),
        },
        claimed_7d: claimed7d.map((r) => r.claim_date),
      };
    });

    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_calendar_status", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
