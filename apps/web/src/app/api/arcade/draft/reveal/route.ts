import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, sha256Hex } from "@/lib/uncertainty/hash";
import { resolveBoostDraftOptions } from "@/lib/arcade/boostDraft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().uuid(),
  client_seed: z.string().min(8).max(256),
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

  const actionId = String(input.action_id).trim();
  const clientSeed = String(input.client_seed).trim();

  const sql = getSql();

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const rows = await txSql<
          {
            id: string;
            user_id: string;
            module: string;
            profile: "low" | "medium" | "high";
            status: string;
            client_commit_hash: string;
            server_commit_hash: string;
            server_seed_b64: string;
            reveal_json: any;
            outcome_json: any;
          }[]
        >`
          SELECT id::text AS id, user_id::text AS user_id, module, profile, status,
                 client_commit_hash, server_commit_hash, server_seed_b64, reveal_json, outcome_json
          FROM arcade_action
          WHERE id = ${actionId}::uuid
          LIMIT 1
          FOR UPDATE
        `;

        if (rows.length === 0) return { kind: "err" as const, err: apiError("not_found") };
        const action = rows[0]!;
        if (action.user_id !== actingUserId) return { kind: "err" as const, err: apiError("x_user_id_mismatch") };
        if (action.module !== "boost_draft") return { kind: "err" as const, err: apiError("invalid_input") };

        if (action.status === "resolved") {
          return { kind: "ok" as const, already: true, options: action.reveal_json?.options ?? [], picked: action.outcome_json?.picked ?? null };
        }

        if (action.status !== "committed" && action.status !== "ready") {
          return { kind: "err" as const, err: apiError("trade_state_conflict", { details: { status: action.status } }) };
        }

        if (action.status === "ready" && Array.isArray(action.reveal_json?.options)) {
          return { kind: "ok" as const, already: true, options: action.reveal_json.options, picked: null };
        }

        const computedClientCommit = sha256Hex(clientSeed);
        if (!isSha256Hex(computedClientCommit) || computedClientCommit !== String(action.client_commit_hash ?? "").toLowerCase()) {
          return { kind: "err" as const, err: apiError("invalid_input", { details: "client_seed does not match commit" }) };
        }

        const expectedServerCommit = sha256Hex(
          `${action.server_seed_b64}:${action.client_commit_hash}:${action.module}:${action.profile}:${actingUserId}`,
        );
        if (expectedServerCommit !== String(action.server_commit_hash ?? "").toLowerCase()) {
          return { kind: "err" as const, err: apiError("internal_error", { details: "server_commit_mismatch" }) };
        }

        const resolved = resolveBoostDraftOptions({
          actionId: action.id,
          userId: actingUserId,
          module: action.module,
          profile: action.profile,
          serverSeedB64: action.server_seed_b64,
          clientSeed,
          clientCommitHash: action.client_commit_hash,
        });

        const revealJson = {
          module: action.module,
          profile: action.profile,
          options: resolved.options,
          audit: {
            client_commit_hash: action.client_commit_hash,
            server_commit_hash: action.server_commit_hash,
            server_seed_b64: action.server_seed_b64,
            random_hashes: resolved.audit.random_hashes,
            rolls: resolved.audit.rolls,
            totals: resolved.audit.totals,
          },
        };

        await txSql`
          UPDATE arcade_action
          SET status = 'ready',
              reveal_json = ${txSql.json(revealJson)}
          WHERE id = ${actionId}::uuid
        `;

        return { kind: "ok" as const, already: false, options: resolved.options, picked: null };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json({ ok: true, already_revealed: out.already, options: out.options, picked: out.picked }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_draft_reveal", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
