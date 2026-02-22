import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, randomSeedB64, sha256Hex } from "@/lib/uncertainty/hash";
import { enforceArcadeSafety } from "@/lib/arcade/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  profile: z.enum(["low", "medium", "high"]).default("low"),
  client_commit_hash: z.string().min(1),
});

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

  const clientCommit = String(input.client_commit_hash ?? "").trim().toLowerCase();
  if (!isSha256Hex(clientCommit)) return apiError("invalid_input", { details: "client_commit_hash must be sha256 hex" });

  const profile = input.profile;
  const serverSeedB64 = randomSeedB64(32);

  const weekIso = weekStartIso(new Date());
  const serverCommit = sha256Hex(`${serverSeedB64}:${clientCommit}:${MODULE_KEY}:${profile}:${actingUserId}:week=${weekIso}`);

  const sql = getSql();

  try {
    const row = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: MODULE_KEY });
        if (!safe.ok) return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };

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
            ${txSql.json({ week_start: weekIso } as any)}
          )
          RETURNING id::text AS id, requested_at
        `;

        // Enforce: one participation per week.
        await txSql`
          INSERT INTO arcade_daily_claim (user_id, module, claim_date, action_id)
          VALUES (${actingUserId}::uuid, ${MODULE_KEY}, ${weekIso}::date, ${action!.id}::uuid)
        `;

        return { kind: "ok" as const, action_id: action!.id, requested_at: action!.requested_at, week_start: weekIso };
      });
    });

    if ((row as any).kind === "err") return (row as any).err;

    return Response.json(
      {
        ok: true,
        action_id: (row as any).action_id,
        module: MODULE_KEY,
        profile,
        week_start: (row as any).week_start,
        server_commit_hash: serverCommit,
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_shared_pool_commit", e);
    if (dep) return dep;

    const anyErr = e as any;
    if (anyErr?.code === "23505") return apiError("rate_limit_exceeded", { details: "Already joined this week" });

    return apiError("internal_error");
  }
}
