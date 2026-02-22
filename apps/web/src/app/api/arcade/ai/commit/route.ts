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
  prompt: z.string().min(10).max(800),
});

const MODULE_KEY = "ai_oracle";

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
  const prompt = String(input.prompt ?? "").trim();
  const promptPreview = prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
  const promptHash = sha256Hex(prompt);

  const serverSeedB64 = randomSeedB64(32);
  const serverCommit = sha256Hex(`${serverSeedB64}:${clientCommit}:${MODULE_KEY}:${profile}:${actingUserId}:prompt=${promptHash}`);

  const sql = getSql();

  try {
    const row = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: MODULE_KEY });
        if (!safe.ok) return { kind: "deny" as const, err: apiError(safe.error, { details: safe.details }) };

        // Anti-spam: max 5 commits in the last 60s.
        const [lim] = await txSql<{ c: string }[]>`
          SELECT count(*)::text AS c
          FROM arcade_action
          WHERE user_id = ${actingUserId}::uuid
            AND module = ${MODULE_KEY}
            AND requested_at >= (now() - interval '60 seconds')
        `;
        if (Number(lim?.c ?? "0") >= 5) return { kind: "err" as const };

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
            ${txSql.json({ prompt_hash: promptHash, prompt_preview: promptPreview, prompt_len: prompt.length } as any)}
          )
          RETURNING id::text AS id, requested_at
        `;

        return { kind: "ok" as const, action_id: action!.id, requested_at: action!.requested_at };
      });
    });

    if ((row as any).kind === "deny") return (row as any).err;
    if ((row as any).kind === "err") return apiError("rate_limit_exceeded", { details: "Too many oracle requests. Please wait a moment." });

    return Response.json(
      {
        ok: true,
        action_id: (row as any).action_id,
        module: MODULE_KEY,
        profile,
        server_commit_hash: serverCommit,
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_ai_oracle_commit", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
