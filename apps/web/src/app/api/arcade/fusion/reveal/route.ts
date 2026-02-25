import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { isSha256Hex, sha256Hex } from "@/lib/uncertainty/hash";
import { resolveFusion } from "@/lib/arcade/creation";
import { SHARD_ITEM } from "@/lib/arcade/crafting";
import { logArcadeConsumption } from "@/lib/arcade/consumption";
import { addArcadeXp } from "@/lib/arcade/progression";
import { enforceArcadeSafety } from "@/lib/arcade/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().uuid(),
  client_seed: z.string().min(8).max(256),
});

const MODULE_KEY = "fusion";
const FUSION_COST_SHARDS = 25;

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
    limiterName: "arcade.fusion.reveal",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: MODULE_KEY, shardSpend: FUSION_COST_SHARDS });
        if (!safe.ok) return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };

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
            input_json: any;
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
            input_json,
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

        const a = action.input_json?.item_a;
        const b = action.input_json?.item_b;
        const ka = String(a?.kind ?? "").trim();
        const ca = String(a?.code ?? "").trim();
        const ra = String(a?.rarity ?? "").trim();
        const kb = String(b?.kind ?? "").trim();
        const cb = String(b?.code ?? "").trim();
        const rb = String(b?.rarity ?? "").trim();
        if (ka !== "cosmetic" || kb !== "cosmetic" || !ca || !cb || !ra || !rb || (ca === cb && ra === rb)) {
          return { kind: "err" as const, err: apiError("internal_error", { details: "invalid_action_input" }) };
        }

        // Lock items.
        const invA = await txSql<{ id: string; quantity: number }[]>`
          SELECT id::text AS id, quantity
          FROM arcade_inventory
          WHERE user_id = ${actingUserId}::uuid
            AND kind = ${ka}
            AND code = ${ca}
            AND rarity = ${ra}
          LIMIT 1
          FOR UPDATE
        `;
        const invB = await txSql<{ id: string; quantity: number }[]>`
          SELECT id::text AS id, quantity
          FROM arcade_inventory
          WHERE user_id = ${actingUserId}::uuid
            AND kind = ${kb}
            AND code = ${cb}
            AND rarity = ${rb}
          LIMIT 1
          FOR UPDATE
        `;
        if (!invA.length || !invB.length) return { kind: "err" as const, err: apiError("not_found") };
        if (Number(invA[0]!.quantity ?? 0) < 1 || Number(invB[0]!.quantity ?? 0) < 1) {
          return { kind: "err" as const, err: apiError("insufficient_balance") };
        }

        // Lock shards.
        const shardRows = await txSql<{ id: string; quantity: number }[]>`
          SELECT id::text AS id, quantity
          FROM arcade_inventory
          WHERE user_id = ${actingUserId}::uuid
            AND kind = ${SHARD_ITEM.kind}
            AND code = ${SHARD_ITEM.code}
            AND rarity = ${SHARD_ITEM.rarity}
          LIMIT 1
          FOR UPDATE
        `;
        const shardQty = Number(shardRows[0]?.quantity ?? 0);
        if (shardQty < FUSION_COST_SHARDS) {
          return {
            kind: "err" as const,
            err: apiError("insufficient_balance", { details: { message: `Need ${FUSION_COST_SHARDS} shards to fuse.` } }),
          };
        }

        const resolved = resolveFusion({
          actionId: action.id,
          userId: actingUserId,
          module: action.module,
          profile: action.profile,
          serverSeedB64: action.server_seed_b64,
          clientSeed,
          clientCommitHash: action.client_commit_hash,
          input: { code_a: ca, rarity_a: ra, code_b: cb, rarity_b: rb },
        });

        // Consume items.
        async function decInv(id: string, quantity: number) {
          const remaining = quantity - 1;
          if (remaining === 0) {
            await txSql`DELETE FROM arcade_inventory WHERE id = ${id}::uuid`;
          } else {
            await txSql`UPDATE arcade_inventory SET quantity = ${remaining}, updated_at = now() WHERE id = ${id}::uuid`;
          }
        }
        await decInv(invA[0]!.id, Number(invA[0]!.quantity));
        await decInv(invB[0]!.id, Number(invB[0]!.quantity));

        await logArcadeConsumption(txSql, {
          user_id: actingUserId,
          kind: ka,
          code: ca,
          rarity: ra,
          quantity: 1,
          context_type: "fusion_input",
          context_id: action.id,
          module: MODULE_KEY,
          metadata: { slot: "a", consumed: true },
        });
        await logArcadeConsumption(txSql, {
          user_id: actingUserId,
          kind: kb,
          code: cb,
          rarity: rb,
          quantity: 1,
          context_type: "fusion_input",
          context_id: action.id,
          module: MODULE_KEY,
          metadata: { slot: "b", consumed: true },
        });

        // Spend shards.
        const shardId = shardRows[0]!.id;
        const shardRemaining = shardQty - FUSION_COST_SHARDS;
        if (shardRemaining === 0) {
          await txSql`DELETE FROM arcade_inventory WHERE id = ${shardId}::uuid`;
        } else {
          await txSql`UPDATE arcade_inventory SET quantity = ${shardRemaining}, updated_at = now() WHERE id = ${shardId}::uuid`;
        }

        await logArcadeConsumption(txSql, {
          user_id: actingUserId,
          kind: SHARD_ITEM.kind,
          code: SHARD_ITEM.code,
          rarity: SHARD_ITEM.rarity,
          quantity: FUSION_COST_SHARDS,
          context_type: "fusion_cost",
          context_id: action.id,
          module: MODULE_KEY,
          metadata: { cost_shards: FUSION_COST_SHARDS },
        });

        // Grant output.
        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${resolved.outcome.kind},
            ${resolved.outcome.code},
            ${resolved.outcome.rarity},
            1,
            ${txSql.json({ label: resolved.outcome.label, ...resolved.outcome.metadata, source: MODULE_KEY, action_id: action.id })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `;

        const outcomeJson = {
          module: action.module,
          profile: action.profile,
          input: { item_a: { kind: ka, code: ca, rarity: ra }, item_b: { kind: kb, code: cb, rarity: rb } },
          outcome: resolved.outcome,
          audit: {
            client_commit_hash: action.client_commit_hash,
            server_commit_hash: action.server_commit_hash,
            server_seed_b64: action.server_seed_b64,
            random_hash: resolved.audit.random_hash,
            roll: resolved.audit.roll,
            total: resolved.audit.total,
            upgraded: resolved.audit.upgraded,
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
          deltaXp: 3,
          contextRandomHash: resolved.audit.random_hash,
          source: MODULE_KEY,
        });

        return { kind: "ok" as const, already: false, outcome: outcomeJson };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json({ ok: true, action_id: actionId, already_resolved: out.already, result: out.outcome }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_fusion_reveal", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
