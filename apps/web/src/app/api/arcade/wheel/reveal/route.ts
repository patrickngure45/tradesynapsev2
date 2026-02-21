import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, sha256Hex } from "@/lib/uncertainty/hash";
import { resolveRarityWheel } from "@/lib/arcade/rarityWheel";
import { logArcadeConsumption } from "@/lib/arcade/consumption";
import { addArcadeXp } from "@/lib/arcade/progression";
import { enforceArcadeSafety } from "@/lib/arcade/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().uuid(),
  client_seed: z.string().min(8).max(256),
});

const MODULE_KEY = "rarity_wheel";
const SHARD_KIND = "shard";
const SHARD_CODE = "arcade_shard";
const SHARD_RARITY = "common";
const SPIN_COST_SHARDS = 10;

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

  const actionId = input.action_id;
  const clientSeed = String(input.client_seed ?? "").trim();

  const sql = getSql();

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: MODULE_KEY, shardSpend: SPIN_COST_SHARDS });
        if (!safe.ok) {
          return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };
        }

        const actions = await txSql<
          {
            id: string;
            user_id: string;
            module: string;
            profile: "low" | "medium" | "high";
            status: string;
            client_commit_hash: string;
            server_commit_hash: string;
            server_seed_b64: string;
            outcome_json: any;
          }[]
        >`
          SELECT
            id::text AS id,
            user_id::text AS user_id,
            module,
            profile,
            status,
            client_commit_hash,
            server_commit_hash,
            server_seed_b64,
            outcome_json
          FROM arcade_action
          WHERE id = ${actionId}::uuid
          LIMIT 1
          FOR UPDATE
        `;

        if (!actions.length) return { kind: "err" as const, err: apiError("not_found") };
        const action = actions[0]!;

        if (action.user_id !== actingUserId) return { kind: "err" as const, err: apiError("x_user_id_mismatch") };
        if (action.module !== MODULE_KEY) return { kind: "err" as const, err: apiError("invalid_input") };

        if (action.status === "resolved") {
          return { kind: "ok" as const, already: true, outcome: action.outcome_json };
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

        // Load pity state.
        const stateRows = await txSql<{ value_json: any }[]>`
          SELECT value_json
          FROM arcade_state
          WHERE user_id = ${actingUserId}::uuid AND key = 'rarity_wheel'
          LIMIT 1
          FOR UPDATE
        `;
        const pityRare = Number(stateRows[0]?.value_json?.pity_rare ?? 0);

        // Ensure shards (spend on success).
        const shardRows = await txSql<{ id: string; quantity: number }[]>`
          SELECT id::text AS id, quantity
          FROM arcade_inventory
          WHERE user_id = ${actingUserId}::uuid
            AND kind = ${SHARD_KIND}
            AND code = ${SHARD_CODE}
            AND rarity = ${SHARD_RARITY}
          LIMIT 1
          FOR UPDATE
        `;
        const shardQty = Number(shardRows[0]?.quantity ?? 0);
        if (shardQty < SPIN_COST_SHARDS) {
          return { kind: "err" as const, err: apiError("insufficient_balance", { details: { message: `Need ${SPIN_COST_SHARDS} shards to spin.` } }) };
        }

        const resolved = resolveRarityWheel({
          actionId: action.id,
          userId: actingUserId,
          module: action.module,
          profile: action.profile,
          serverSeedB64: action.server_seed_b64,
          clientSeed,
          clientCommitHash: action.client_commit_hash,
          pityRare,
        });

        // Spend shards.
        const shardId = shardRows[0]!.id;
        const remaining = shardQty - SPIN_COST_SHARDS;
        if (remaining === 0) {
          await txSql`
            DELETE FROM arcade_inventory
            WHERE id = ${shardId}::uuid
          `;
        } else {
          await txSql`
            UPDATE arcade_inventory
            SET quantity = ${remaining}, updated_at = now()
            WHERE id = ${shardId}::uuid
          `;
        }

        await logArcadeConsumption(txSql, {
          user_id: actingUserId,
          kind: SHARD_KIND,
          code: SHARD_CODE,
          rarity: SHARD_RARITY,
          quantity: SPIN_COST_SHARDS,
          context_type: "rarity_wheel",
          context_id: action.id,
          module: "rarity_wheel",
          metadata: { cost_shards: SPIN_COST_SHARDS },
        });

        // Grant cosmetic.
        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${resolved.outcome.kind},
            ${resolved.outcome.code},
            ${resolved.outcome.rarity},
            1,
            ${txSql.json({ label: resolved.outcome.label, source: MODULE_KEY, action_id: action.id })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `;

        const nextPity = resolved.outcome.rarity === "common" || resolved.outcome.rarity === "uncommon" ? pityRare + 1 : 0;
        await txSql`
          INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
          VALUES (${actingUserId}::uuid, 'rarity_wheel', ${txSql.json({ pity_rare: nextPity })}::jsonb, now(), now())
          ON CONFLICT (user_id, key)
          DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
        `;

        const outcomeJson = {
          module: action.module,
          profile: action.profile,
          outcome: resolved.outcome,
          audit: {
            client_commit_hash: action.client_commit_hash,
            server_commit_hash: action.server_commit_hash,
            server_seed_b64: action.server_seed_b64,
            ...resolved.audit,
          },
        };

        await txSql`
          UPDATE arcade_action
          SET status = 'resolved',
              resolved_at = now(),
              reveal_json = ${txSql.json({ client_seed_present: true })},
              outcome_json = ${txSql.json(outcomeJson)}
          WHERE id = ${action.id}::uuid
        `;

        await addArcadeXp(txSql as any, {
          userId: actingUserId,
          deltaXp: 1,
          contextRandomHash: resolved.audit.random_hash,
          source: "rarity_wheel",
        });

        return { kind: "ok" as const, already: false, outcome: outcomeJson };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json(
      { ok: true, action_id: actionId, already_resolved: out.already, result: out.outcome },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_wheel_reveal", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
