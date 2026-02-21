import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, sha256Hex } from "@/lib/uncertainty/hash";
import { resolveDailyDrop } from "@/lib/arcade/dailyDrop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().min(1),
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
            requested_at: string;
            resolved_at: string | null;
            outcome_json: any;
          }[]
        >`
          SELECT id, user_id, module, profile, status, client_commit_hash, server_commit_hash, server_seed_b64,
                 requested_at, resolved_at, outcome_json
          FROM arcade_action
          WHERE id = ${actionId}::uuid
          LIMIT 1
        `;

        if (rows.length === 0) {
          return { kind: "err" as const, err: apiError("not_found") };
        }

        const action = rows[0]!;
        if (action.user_id !== actingUserId) {
          return { kind: "err" as const, err: apiError("x_user_id_mismatch") };
        }

        if (action.status === "resolved") {
          return {
            kind: "ok" as const,
            alreadyResolved: true,
            action,
            outcome: action.outcome_json,
          };
        }

        if (action.status !== "committed") {
          return { kind: "err" as const, err: apiError("trade_state_conflict", { details: { status: action.status } }) };
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

        const resolved = resolveDailyDrop({
          actionId: action.id,
          userId: actingUserId,
          module: action.module,
          profile: action.profile,
          serverSeedB64: action.server_seed_b64,
          clientSeed,
          clientCommitHash: action.client_commit_hash,
        });

        const outcomeJson = {
          module: action.module,
          profile: action.profile,
          outcome: resolved.outcome,
          audit: {
            client_commit_hash: action.client_commit_hash,
            server_commit_hash: action.server_commit_hash,
            server_seed_b64: action.server_seed_b64,
            random_hash: resolved.audit.random_hash,
            roll: resolved.audit.roll,
            total: resolved.audit.total,
          },
        };

        // Inventory: upsert stack.
        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${resolved.outcome.kind},
            ${resolved.outcome.code},
            ${resolved.outcome.rarity},
            1,
            ${txSql.json({ label: resolved.outcome.label, source: action.module })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `;

        await txSql`
          UPDATE arcade_action
          SET status = 'resolved',
              resolved_at = now(),
              reveal_json = ${txSql.json({ client_seed_present: true })},
              outcome_json = ${txSql.json(outcomeJson)}
          WHERE id = ${actionId}::uuid
        `;

        return {
          kind: "ok" as const,
          alreadyResolved: false,
          action,
          outcome: outcomeJson,
        };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json(
      {
        ok: true,
        action_id: actionId,
        already_resolved: out.alreadyResolved,
        result: out.outcome,
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_daily_reveal", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
