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
  module: z.string().min(1).max(64).default("daily_drop"),
  profile: z.enum(["low", "medium", "high"]).default("low"),
  client_commit_hash: z.string().min(1),
});

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

  const moduleKey = String(input.module ?? "daily_drop").trim() || "daily_drop";
  const profile = input.profile;

  const serverSeedB64 = randomSeedB64(32);
  const serverCommit = sha256Hex(`${serverSeedB64}:${clientCommit}:${moduleKey}:${profile}:${actingUserId}`);

  const sql = getSql();

  const today = new Date();
  const claimDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const claimDateIso = claimDate.toISOString().slice(0, 10);

  try {
    const row = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: moduleKey });
        if (!safe.ok) return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };

        const [action] = await txSql<
          {
            id: string;
            requested_at: string;
          }[]
        >`
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
            ${moduleKey},
            ${profile},
            'committed',
            ${clientCommit},
            ${serverCommit},
            ${serverSeedB64},
            ${txSql.json({})}
          )
          RETURNING id, requested_at
        `;

        // Enforce: one claim per day per module.
        await txSql`
          INSERT INTO arcade_daily_claim (user_id, module, claim_date, action_id)
          VALUES (${actingUserId}::uuid, ${moduleKey}, ${claimDateIso}::date, ${action!.id}::uuid)
        `;

        return { kind: "ok" as const, action_id: action!.id, requested_at: action!.requested_at };
      });
    });

    if ((row as any).kind === "err") return (row as any).err;

    return Response.json(
      {
        ok: true,
        action_id: row.action_id,
        module: moduleKey,
        profile,
        server_commit_hash: serverCommit,
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_daily_commit", e);
    if (dep) return dep;

    const anyErr = e as any;
    // Unique(user_id, module, claim_date)
    if (anyErr?.code === "23505") {
      return apiError("rate_limit_exceeded", { details: "Already claimed today" });
    }

    return apiError("internal_error");
  }
}
