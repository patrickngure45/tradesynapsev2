import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { isSha256Hex, sha256Hex } from "@/lib/uncertainty/hash";
import { enforceArcadeSafety } from "@/lib/arcade/safety";
import { logArcadeConsumption } from "@/lib/arcade/consumption";
import { addArcadeXp } from "@/lib/arcade/progression";
import { resolveSharedPool } from "@/lib/arcade/sharedPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().uuid(),
  client_seed: z.string().min(8).max(256),
});

const MODULE_KEY = "shared_pool";
const SHARD_KIND = "shard";
const SHARD_CODE = "arcade_shard";
const SHARD_RARITY = "common";
const JOIN_COST_SHARDS = 10;

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
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "arcade.shared_pool.reveal",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: MODULE_KEY, shardSpend: JOIN_COST_SHARDS });
        if (!safe.ok) return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };

        const rows = await txSql<
          Array<{
            id: string;
            user_id: string;
            module: string;
            profile: "low" | "medium" | "high";
            status: string;
            client_commit_hash: string;
            server_commit_hash: string;
            server_seed_b64: string;
            input_json: any;
            outcome_json: any;
          }>
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
            input_json,
            outcome_json
          FROM arcade_action
          WHERE id = ${actionId}::uuid
          LIMIT 1
          FOR UPDATE
        `;

        if (!rows.length) return { kind: "err" as const, err: apiError("not_found") };
        const action = rows[0]!;

        if (action.user_id !== actingUserId) return { kind: "err" as const, err: apiError("x_user_id_mismatch") };
        if (action.module !== MODULE_KEY) return { kind: "err" as const, err: apiError("invalid_input") };

        if (action.status === "resolved") return { kind: "ok" as const, already: true, outcome: action.outcome_json };
        if (action.status !== "committed") {
          return { kind: "err" as const, err: apiError("trade_state_conflict", { details: { status: action.status } }) };
        }

        const computedClientCommit = sha256Hex(clientSeed);
        if (!isSha256Hex(computedClientCommit) || computedClientCommit !== String(action.client_commit_hash ?? "").toLowerCase()) {
          return { kind: "err" as const, err: apiError("invalid_input", { details: "client_seed does not match commit" }) };
        }

        const weekStartIso = String(action.input_json?.week_start ?? "").trim();
        if (!weekStartIso) return { kind: "err" as const, err: apiError("internal_error", { details: "missing_week_start" }) };

        const expectedServerCommit = sha256Hex(
          `${action.server_seed_b64}:${action.client_commit_hash}:${action.module}:${action.profile}:${actingUserId}:week=${weekStartIso}`,
        );
        if (expectedServerCommit !== String(action.server_commit_hash ?? "").toLowerCase()) {
          return { kind: "err" as const, err: apiError("internal_error", { details: "server_commit_mismatch" }) };
        }

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
        if (shardQty < JOIN_COST_SHARDS) {
          return {
            kind: "err" as const,
            err: apiError("insufficient_balance", { details: { message: `Need ${JOIN_COST_SHARDS} shards to join.` } }),
          };
        }

        const resolved = resolveSharedPool({
          actionId: action.id,
          userId: actingUserId,
          module: action.module,
          profile: action.profile,
          serverSeedB64: action.server_seed_b64,
          clientSeed,
          clientCommitHash: action.client_commit_hash,
          weekStartIso,
        });

        // Spend shards.
        const shardId = shardRows[0]!.id;
        const remaining = shardQty - JOIN_COST_SHARDS;
        if (remaining === 0) {
          await txSql`DELETE FROM arcade_inventory WHERE id = ${shardId}::uuid`;
        } else {
          await txSql`UPDATE arcade_inventory SET quantity = ${remaining}, updated_at = now() WHERE id = ${shardId}::uuid`;
        }

        await logArcadeConsumption(txSql, {
          user_id: actingUserId,
          kind: SHARD_KIND,
          code: SHARD_CODE,
          rarity: SHARD_RARITY,
          quantity: JOIN_COST_SHARDS,
          context_type: "shared_pool",
          context_id: action.id,
          module: MODULE_KEY,
          metadata: { cost_shards: JOIN_COST_SHARDS, week_start: weekStartIso },
        });

        // Grant baseline.
        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${resolved.outcome.baseline.kind},
            ${resolved.outcome.baseline.code},
            ${resolved.outcome.baseline.rarity},
            1,
            ${txSql.json({ label: resolved.outcome.baseline.label, source: MODULE_KEY, week_start: weekStartIso, action_id: action.id })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `;

        if (resolved.outcome.boost) {
          await txSql`
            INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
            VALUES (
              ${actingUserId}::uuid,
              ${resolved.outcome.boost.kind},
              ${resolved.outcome.boost.code},
              ${resolved.outcome.boost.rarity},
              1,
              ${txSql.json({ label: resolved.outcome.boost.label, source: MODULE_KEY, week_start: weekStartIso, action_id: action.id })},
              now(),
              now()
            )
            ON CONFLICT (user_id, kind, code, rarity)
            DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
          `;
        }

        const outcomeJson = {
          module: action.module,
          profile: action.profile,
          week_start: weekStartIso,
          cost_shards: JOIN_COST_SHARDS,
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
          source: MODULE_KEY,
        });

        return { kind: "ok" as const, already: false, outcome: outcomeJson };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json({ ok: true, action_id: actionId, already_resolved: out.already, result: out.outcome }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_shared_pool_reveal", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
