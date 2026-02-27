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

const MODULE_KEY = "insight_pack";
const GATE_KEY_CODE = "gate_key";

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
  const serverCommit = sha256Hex(`${serverSeedB64}:${clientCommit}:${MODULE_KEY}:${profile}:${actingUserId}`);

  const sql = getSql();

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: MODULE_KEY });
        if (!safe.ok) return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };

        // Anti-spam: max 10 commits in the last 60s.
        const [lim] = await txSql<{ c: string }[]>`
          SELECT count(*)::text AS c
          FROM arcade_action
          WHERE user_id = ${actingUserId}::uuid
            AND module = ${MODULE_KEY}
            AND requested_at >= (now() - interval '60 seconds')
        `;
        if (Number(lim?.c ?? "0") >= 10) return { kind: "err" as const, err: apiError("rate_limit_exceeded") };

        // Outcome-based unlocks: profile=high requires a key.
        // Accept either the global Gate Key OR any season set key earned from collections.
        if (profile === "high") {
          const rows = await txSql<{ code: string }[]>`
            SELECT code
            FROM arcade_inventory
            WHERE user_id = ${actingUserId}::uuid
              AND kind = 'key'
              AND quantity > 0
              AND (
                code = ${GATE_KEY_CODE}
                OR code LIKE 'season\\_%\\_set\\_%\\_key'
              )
            LIMIT 1
          `;
          if (!rows.length) {
            return { kind: "err" as const, err: apiError("arcade_key_required", { details: { key: GATE_KEY_CODE } }) };
          }
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
            ${txSql.json({})}
          )
          RETURNING id::text AS id, requested_at
        `;

        return { kind: "ok" as const, action_id: action!.id, requested_at: action!.requested_at };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json(
      {
        ok: true,
        action_id: out.action_id,
        module: MODULE_KEY,
        profile,
        server_commit_hash: serverCommit,
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_insight_commit", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
