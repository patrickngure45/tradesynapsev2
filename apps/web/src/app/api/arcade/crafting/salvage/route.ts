import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { SHARD_ITEM, shardsPerUnitForSalvage } from "@/lib/arcade/crafting";
import { logArcadeConsumption } from "@/lib/arcade/consumption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  kind: z.string().min(1).max(40),
  code: z.string().min(1).max(120),
  rarity: z.string().min(1).max(20),
  quantity: z.number().int().min(1).max(10_000),
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

  const kind = String(input.kind).trim();
  const code = String(input.code).trim();
  const rarity = String(input.rarity).trim();
  const qty = Number(input.quantity);

  if (kind === SHARD_ITEM.kind && code === SHARD_ITEM.code) {
    return apiError("invalid_input", { details: "cannot_salvage_shards" });
  }

  const perUnit = shardsPerUnitForSalvage(rarity);
  const grant = perUnit * qty;

  const sql = getSql();

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const rows = await txSql<{ id: string; quantity: number }[]>`
          SELECT id::text AS id, quantity
          FROM arcade_inventory
          WHERE user_id = ${actingUserId}::uuid
            AND kind = ${kind}
            AND code = ${code}
            AND rarity = ${rarity}
          LIMIT 1
          FOR UPDATE
        `;

        if (rows.length === 0) return { kind: "err" as const, err: apiError("not_found") };
        const item = rows[0]!;
        if (item.quantity < qty) return { kind: "err" as const, err: apiError("insufficient_balance") };

        const remaining = item.quantity - qty;
        if (remaining === 0) {
          await txSql`
            DELETE FROM arcade_inventory
            WHERE id = ${item.id}::uuid
          `;
        } else {
          await txSql`
            UPDATE arcade_inventory
            SET quantity = ${remaining}, updated_at = now()
            WHERE id = ${item.id}::uuid
          `;
        }

        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${SHARD_ITEM.kind},
            ${SHARD_ITEM.code},
            ${SHARD_ITEM.rarity},
            ${grant},
            ${txSql.json({ label: "Arcade Shards", source: "salvage" })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + EXCLUDED.quantity, updated_at = now()
        `;

        await logArcadeConsumption(txSql, {
          user_id: actingUserId,
          kind,
          code,
          rarity,
          quantity: qty,
          context_type: "crafting_salvage",
          context_id: `${kind}:${code}:${rarity}`,
          module: "crafting",
          metadata: {
            shards_per_unit: perUnit,
            shards_granted: grant,
          },
        });

        return { kind: "ok" as const, grant, perUnit };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json({ ok: true, shards_granted: out.grant, shards_per_unit: out.perUnit }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_crafting_salvage", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
