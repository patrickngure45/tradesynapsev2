import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, randomSeedB64, sha256Hex } from "@/lib/uncertainty/hash";
import { pickDailyMissions } from "@/lib/arcade/missions";
import { enforceArcadeSafety } from "@/lib/arcade/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  mission_code: z.string().min(1).max(80),
  profile: z.enum(["low", "medium", "high"]).default("low"),
  client_commit_hash: z.string().min(1),
});

const MODULE_KEY = "flash_mission";

function utcDateIso(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof postSchema>;
  try {
    input = postSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const todayIso = utcDateIso(new Date());
  const missions = pickDailyMissions({ userId: actingUserId, todayIso, count: 2 });
  const allowed = new Set(missions.map((m) => m.code));

  const missionCode = String(input.mission_code ?? "").trim();
  if (!allowed.has(missionCode as any)) return apiError("invalid_input", { details: "mission_not_available_today" });

  const clientCommit = String(input.client_commit_hash ?? "").trim().toLowerCase();
  if (!isSha256Hex(clientCommit)) return apiError("invalid_input", { details: "client_commit_hash must be sha256 hex" });

  const profile = input.profile;
  const serverSeedB64 = randomSeedB64(32);
  const serverCommit = sha256Hex(`${serverSeedB64}:${clientCommit}:${MODULE_KEY}:${profile}:${actingUserId}`);

  const sql = getSql();

  try {
    const row = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: MODULE_KEY });
        if (!safe.ok) return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };

        // Verify completion today.
        const since = `${todayIso}T00:00:00.000Z`;

        if (missionCode === "convert_once") {
          const rows = await txSql<{ ok: boolean }[]>`
            SELECT 1 AS ok
            FROM ex_journal_entry
            WHERE type = 'convert'
              AND (metadata_json->>'user_id') = ${actingUserId}
              AND created_at >= ${since}::timestamptz
            LIMIT 1
          `;
          if (!rows.length) return { kind: "err" as const, err: apiError("rate_limit_exceeded", { details: "Mission not completed yet" }) };
        } else if (missionCode === "transfer_once") {
          const rows = await txSql<{ ok: boolean }[]>`
            SELECT 1 AS ok
            FROM ex_journal_entry
            WHERE type = 'user_transfer'
              AND (metadata_json->>'sender_user_id') = ${actingUserId}
              AND created_at >= ${since}::timestamptz
            LIMIT 1
          `;
          if (!rows.length) return { kind: "err" as const, err: apiError("rate_limit_exceeded", { details: "Mission not completed yet" }) };
        } else if (missionCode === "create_p2p_ad") {
          const rows = await txSql<{ ok: boolean }[]>`
            SELECT 1 AS ok
            FROM p2p_ad
            WHERE user_id = ${actingUserId}::uuid
              AND created_at >= ${since}::timestamptz
            LIMIT 1
          `;
          if (!rows.length) return { kind: "err" as const, err: apiError("rate_limit_exceeded", { details: "Mission not completed yet" }) };
        }

        const [action] = await txSql<{ id: string; requested_at: string }[]>`
          INSERT INTO arcade_action (
            user_id,
            module,
            profile,
            status,
            client_commit_hash,
            server_commit_hash,
            server_seed_b64,
            input_json
          )
          VALUES (
            ${actingUserId}::uuid,
            ${MODULE_KEY},
            ${profile},
            'committed',
            ${clientCommit},
            ${serverCommit},
            ${serverSeedB64},
            ${txSql.json({ mission_code: missionCode, today: todayIso })}
          )
          RETURNING id, requested_at
        `;

        // Enforce: once per day per mission.
        await txSql`
          INSERT INTO arcade_daily_claim (user_id, module, claim_date, action_id)
          VALUES (${actingUserId}::uuid, ${`flash_mission:${missionCode}`}, ${todayIso}::date, ${action!.id}::uuid)
        `;

        return { kind: "ok" as const, action_id: action!.id, requested_at: action!.requested_at };
      });
    });

    if (row.kind === "err") return row.err;

    return Response.json(
      {
        ok: true,
        action_id: row.action_id,
        module: MODULE_KEY,
        profile,
        mission_code: missionCode,
        today: todayIso,
        server_commit_hash: serverCommit,
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_missions_commit", e);
    if (dep) return dep;

    const anyErr = e as any;
    if (anyErr?.code === "23505") {
      return apiError("rate_limit_exceeded", { details: "Already claimed this mission today" });
    }

    return apiError("internal_error");
  }
}
