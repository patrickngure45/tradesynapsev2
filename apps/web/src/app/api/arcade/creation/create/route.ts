import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, randomSeedB64, sha256Hex } from "@/lib/uncertainty/hash";
import { enforceArcadeSafety } from "@/lib/arcade/safety";
import { SHARD_ITEM } from "@/lib/arcade/crafting";
import { logArcadeConsumption } from "@/lib/arcade/consumption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  profile: z.enum(["low", "medium", "high"]).default("low"),
  client_commit_hash: z.string().min(1),
});

const MODULE_KEY = "blind_creation";
const CREATE_COST_SHARDS = 25;
const REVEAL_DELAY_MINUTES = 30;

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

  const nowMs = Date.now();
  const resolvesAtIso = new Date(nowMs + REVEAL_DELAY_MINUTES * 60_000).toISOString();

  const sql = getSql();

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, {
          userId: actingUserId,
          module: MODULE_KEY,
          shardSpend: CREATE_COST_SHARDS,
        });
        if (!safe.ok) return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };

        // Anti-spam: max 5 creates in the last 60s.
        const [lim] = await txSql<{ c: string }[]>`
          SELECT count(*)::text AS c
          FROM arcade_action
          WHERE user_id = ${actingUserId}::uuid
            AND module = ${MODULE_KEY}
            AND requested_at >= (now() - interval '60 seconds')
        `;
        if (Number(lim?.c ?? "0") >= 5) return { kind: "err" as const, err: apiError("rate_limit_exceeded") };

        // Ensure shards.
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
        if (shardQty < CREATE_COST_SHARDS) {
          return {
            kind: "err" as const,
            err: apiError("insufficient_balance", { details: { message: `Need ${CREATE_COST_SHARDS} shards to create.` } }),
          };
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
            input_json,
            resolves_at
          )
          VALUES (
            ${actingUserId}::uuid,
            ${MODULE_KEY},
            ${profile},
            'scheduled',
            ${clientCommit},
            ${serverCommit},
            ${serverSeedB64},
            ${txSql.json({ cost_shards: CREATE_COST_SHARDS, delay_minutes: REVEAL_DELAY_MINUTES })},
            ${resolvesAtIso}::timestamptz
          )
          RETURNING id::text AS id, requested_at
        `;

        // Spend shards immediately.
        const shardId = shardRows[0]!.id;
        const remaining = shardQty - CREATE_COST_SHARDS;
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
          kind: SHARD_ITEM.kind,
          code: SHARD_ITEM.code,
          rarity: SHARD_ITEM.rarity,
          quantity: CREATE_COST_SHARDS,
          context_type: "blind_creation",
          context_id: action!.id,
          module: MODULE_KEY,
          metadata: { cost_shards: CREATE_COST_SHARDS, resolves_at: resolvesAtIso },
        });

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
        resolves_at: resolvesAtIso,
        server_commit_hash: serverCommit,
      },
      { status: 201 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_creation_create", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
