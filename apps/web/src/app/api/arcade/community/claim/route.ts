import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { enforceArcadeSafety } from "@/lib/arcade/safety";
import { SHARD_ITEM } from "@/lib/arcade/crafting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function weekStartIsoUtc(d: Date): string {
  const day = d.getUTCDay();
  const delta = (day + 6) % 7;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - delta);
  return start.toISOString().slice(0, 10);
}

const THRESHOLD = 50;
const REWARD_SHARDS = 40;
const MODULE_KEY = "community_event";

export async function POST(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "arcade.community.claim",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  const now = new Date();
  const weekStart = weekStartIsoUtc(now);
  const since = `${weekStart}T00:00:00.000Z`;
  const stateKey = `community_event:${weekStart}`;

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: MODULE_KEY });
        if (!safe.ok) return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };

        const [row] = await txSql<{ c: string }[]>`
          SELECT count(*)::text AS c
          FROM arcade_action
          WHERE requested_at >= ${since}::timestamptz
        `;

        const progress = Number(row?.c ?? "0");
        if (!Number.isFinite(progress) || progress < THRESHOLD) {
          return {
            kind: "err" as const,
            err: apiError("trade_state_conflict", { details: { unlocked: false, progress, threshold: THRESHOLD } }),
          };
        }

        const claimedRows = await txSql<{ value_json: any }[]>`
          SELECT value_json
          FROM arcade_state
          WHERE user_id = ${actingUserId}::uuid
            AND key = ${stateKey}
          LIMIT 1
          FOR UPDATE
        `;

        if (Boolean(claimedRows[0]?.value_json?.claimed)) {
          return { kind: "ok" as const, already: true };
        }

        await txSql`
          INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${stateKey},
            ${txSql.json({ claimed: true, claimed_at: new Date().toISOString() })}::jsonb,
            now(),
            now()
          )
          ON CONFLICT (user_id, key)
          DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
        `;

        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${SHARD_ITEM.kind},
            ${SHARD_ITEM.code},
            ${SHARD_ITEM.rarity},
            ${REWARD_SHARDS},
            ${txSql.json({ label: "Arcade Shards", source: MODULE_KEY, week_start: weekStart })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + EXCLUDED.quantity, updated_at = now()
        `;

        return { kind: "ok" as const, already: false, granted_shards: REWARD_SHARDS };
      });
    });

    if ((out as any).kind === "err") return (out as any).err;

    return Response.json(
      {
        ok: true,
        module: MODULE_KEY,
        week_start: weekStart,
        threshold: THRESHOLD,
        granted_shards: (out as any).already ? 0 : (out as any).granted_shards,
        already_claimed: Boolean((out as any).already),
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_community_claim", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
