import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function weekStartIsoUtc(d: Date): string {
  // Monday as start of week.
  const day = d.getUTCDay(); // 0..6 (Sun..Sat)
  const delta = (day + 6) % 7; // Mon->0, Tue->1, ..., Sun->6
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - delta);
  return start.toISOString().slice(0, 10);
}

const THRESHOLD = 50;
const MODULE_KEY = "community_event";

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();

  const now = new Date();
  const weekStart = weekStartIsoUtc(now);
  const since = `${weekStart}T00:00:00.000Z`;
  const stateKey = `community_event:${weekStart}`;

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      const [row] = await sql<{ c: string }[]>`
        SELECT count(*)::text AS c
        FROM arcade_action
        WHERE requested_at >= ${since}::timestamptz
      `;

      const stateRows = await sql<{ value_json: any }[]>`
        SELECT value_json
        FROM arcade_state
        WHERE user_id = ${actingUserId}::uuid
          AND key = ${stateKey}
        LIMIT 1
      `;

      const progress = Number(row?.c ?? "0");
      const unlocked = Number.isFinite(progress) && progress >= THRESHOLD;
      const claimed = Boolean(stateRows[0]?.value_json?.claimed);

      return { progress, unlocked, claimed };
    });

    return Response.json(
      {
        ok: true,
        module: MODULE_KEY,
        week_start: weekStart,
        threshold: THRESHOLD,
        progress: out.progress,
        unlocked: out.unlocked,
        claimed: out.claimed,
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_community_status", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
