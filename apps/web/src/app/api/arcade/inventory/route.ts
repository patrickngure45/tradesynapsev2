import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { SHARD_ITEM } from "@/lib/arcade/crafting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      const items = await sql<
        {
          kind: string;
          code: string;
          rarity: string;
          quantity: number;
          metadata_json: any;
          updated_at: string;
        }[]
      >`
        SELECT kind, code, rarity, quantity, metadata_json, updated_at
        FROM arcade_inventory
        WHERE user_id = ${actingUserId}::uuid
        ORDER BY updated_at DESC
        LIMIT 200
      `;

      const [sh] = await sql<{ quantity: number }[]>`
        SELECT quantity
        FROM arcade_inventory
        WHERE user_id = ${actingUserId}::uuid
          AND kind = ${SHARD_ITEM.kind}
          AND code = ${SHARD_ITEM.code}
          AND rarity = ${SHARD_ITEM.rarity}
        LIMIT 1
      `;

      return { items, shards: Number(sh?.quantity ?? 0) };
    });

    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_inventory", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
