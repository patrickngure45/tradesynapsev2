import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { pickDailyMissions } from "@/lib/arcade/missions";

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
  const todayIso = utcDateIso(new Date());

  try {
    const missions = pickDailyMissions({ userId: actingUserId, todayIso, count: 2 });

    const out = await retryOnceOnTransientDbError(async () => {
      const since = `${todayIso}T00:00:00.000Z`;

      const [convert] = await sql<{ ok: boolean }[]>`
        SELECT 1 AS ok
        FROM ex_journal_entry
        WHERE type = 'convert'
          AND (metadata_json->>'user_id') = ${actingUserId}
          AND created_at >= ${since}::timestamptz
        LIMIT 1
      `;

      const [transfer] = await sql<{ ok: boolean }[]>`
        SELECT 1 AS ok
        FROM ex_journal_entry
        WHERE type = 'user_transfer'
          AND (metadata_json->>'sender_user_id') = ${actingUserId}
          AND created_at >= ${since}::timestamptz
        LIMIT 1
      `;

      const [ad] = await sql<{ ok: boolean }[]>`
        SELECT 1 AS ok
        FROM p2p_ad
        WHERE user_id = ${actingUserId}::uuid
          AND created_at >= ${since}::timestamptz
        LIMIT 1
      `;

      // Claimed: use arcade_daily_claim rows keyed by module+mission.
      const claimedRows = await sql<{ module: string }[]>`
        SELECT module
        FROM arcade_daily_claim
        WHERE user_id = ${actingUserId}::uuid
          AND claim_date = ${todayIso}::date
          AND module LIKE 'flash_mission:%'
      `;
      const claimed = new Set(claimedRows.map((r) => String(r.module ?? "")));

      const completion: Record<string, boolean> = {
        convert_once: Boolean(convert?.ok),
        transfer_once: Boolean(transfer?.ok),
        create_p2p_ad: Boolean(ad?.ok),
      };

      return { completion, claimed };
    });

    return Response.json(
      {
        ok: true,
        today: todayIso,
        missions: missions.map((m) => {
          const completed = Boolean(out.completion[m.code]);
          const claimKey = `flash_mission:${m.code}`;
          const alreadyClaimed = out.claimed.has(claimKey);
          return {
            ...m,
            completed,
            claimable: completed && !alreadyClaimed,
            claimed: alreadyClaimed,
          };
        }),
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_missions_status", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
