import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { seasonalBadgePoolMetaFor } from "@/lib/arcade/seasonalBadgesMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nextUtcMondayStart(now: Date): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const day = now.getUTCDay(); // 0=Sun .. 6=Sat

  const startToday = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  const next = new Date(startToday.getTime() + daysUntilMonday * 24 * 3600_000);
  return next;
}

function currentUtcMondayStart(now: Date): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const day = now.getUTCDay();
  const startToday = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const daysSinceMonday = (day + 6) % 7; // Monday -> 0
  return new Date(startToday.getTime() - daysSinceMonday * 24 * 3600_000);
}

function currentSeasonKey(): { seasonKey: string; startsAt: string; nextShiftAt: string } {
  const now = new Date();
  const seasonStart = currentUtcMondayStart(now);
  const nextShift = nextUtcMondayStart(now);
  const seasonKey = `week:${seasonStart.toISOString().slice(0, 10)}`;
  return { seasonKey, startsAt: seasonStart.toISOString(), nextShiftAt: nextShift.toISOString() };
}

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const url = new URL(request.url);
  const requestedSeasonKey = String(url.searchParams.get("season_key") ?? "").trim();
  const season = currentSeasonKey();
  const seasonKey = requestedSeasonKey || season.seasonKey;

  const meta = seasonalBadgePoolMetaFor(seasonKey);
  const stateKey = `badge_pools:${seasonKey}`;

  const sql = getSql();

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<{ value_json: any }[]>`
        SELECT value_json
        FROM arcade_state
        WHERE user_id = ${actingUserId}::uuid
          AND key = ${stateKey}
        LIMIT 1
      `;

      const v = rows[0]?.value_json;
      const collected: Record<string, true> =
        v && typeof v === "object" && !Array.isArray(v) && v.collected && typeof v.collected === "object" && !Array.isArray(v.collected)
          ? (v.collected as Record<string, true>)
          : {};
      const unlocked: Record<string, true> =
        v && typeof v === "object" && !Array.isArray(v) && v.unlocked_sets && typeof v.unlocked_sets === "object" && !Array.isArray(v.unlocked_sets)
          ? (v.unlocked_sets as Record<string, true>)
          : {};

      const sets = meta.sets.map((s) => {
        const have = s.requiredCodes.reduce((acc, code) => acc + (collected[code] ? 1 : 0), 0);
        return {
          id: s.id,
          label: s.label,
          required: s.requiredCodes.length,
          have,
          unlocked: Boolean(unlocked[s.id]),
          unlock_key: s.unlockKey,
        };
      });

      return {
        season: { key: seasonKey, starts_at: season.startsAt, next_shift_at: season.nextShiftAt },
        pool: { key: meta.poolKey, label: meta.label },
        badges: meta.badges,
        collected_codes: Object.keys(collected),
        sets,
      };
    });

    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_badge_pools_status", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
