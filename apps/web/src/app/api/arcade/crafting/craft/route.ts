import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { findRecipe, SHARD_ITEM } from "@/lib/arcade/crafting";
import { logArcadeConsumption } from "@/lib/arcade/consumption";
import { enforceArcadeSafety } from "@/lib/arcade/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  recipe_code: z.string().min(1).max(80),
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

  const recipe = findRecipe(input.recipe_code);
  if (!recipe) return apiError("invalid_input", { details: "unknown_recipe" });

  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "arcade.crafting.craft",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const safe = await enforceArcadeSafety(txSql as any, { userId: actingUserId, module: "crafting", shardSpend: recipe.cost_shards });
        if (!safe.ok) {
          return { kind: "err" as const, err: apiError(safe.error, { details: safe.details }) };
        }

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
        if (shardQty < recipe.cost_shards) return { kind: "err" as const, err: apiError("insufficient_balance") };

        const remaining = shardQty - recipe.cost_shards;
        if (shardRows.length === 0) return { kind: "err" as const, err: apiError("insufficient_balance") };
        const shardId = shardRows[0]!.id;

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

        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${recipe.grant.kind},
            ${recipe.grant.code},
            ${recipe.grant.rarity},
            1,
            ${txSql.json({ label: recipe.grant.label, ...(recipe.grant.metadata ?? {}), source: "crafting", recipe_code: recipe.recipe_code })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `;

        await logArcadeConsumption(txSql, {
          user_id: actingUserId,
          kind: SHARD_ITEM.kind,
          code: SHARD_ITEM.code,
          rarity: SHARD_ITEM.rarity,
          quantity: recipe.cost_shards,
          context_type: "crafting_craft",
          context_id: recipe.recipe_code,
          module: "crafting",
          metadata: {
            recipe_code: recipe.recipe_code,
            grant: recipe.grant,
          },
        });

        return { kind: "ok" as const, remaining, grant: recipe.grant };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json({ ok: true, recipe: recipe.recipe_code, shards_remaining: out.remaining, grant: out.grant }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_crafting_craft", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
