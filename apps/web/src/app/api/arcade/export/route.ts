import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();

  try {
    const data = await retryOnceOnTransientDbError(async () => {
      const [limits] = await sql<
        { self_excluded_until: string | null; daily_action_limit: number | null; daily_shard_spend_limit: number | null }[]
      >`
        SELECT self_excluded_until::text AS self_excluded_until, daily_action_limit, daily_shard_spend_limit
        FROM arcade_safety_limits
        WHERE user_id = ${actingUserId}::uuid
        LIMIT 1
      `;

      const actions = await sql<any[]>`
        SELECT
          id::text AS id,
          module,
          profile,
          status,
          requested_at::text AS requested_at,
          resolves_at::text AS resolves_at,
          resolved_at::text AS resolved_at,
          input_json,
          reveal_json,
          outcome_json
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
        ORDER BY requested_at DESC
        LIMIT 1000
      `;

      const inventory = await sql<any[]>`
        SELECT
          id::text AS id,
          kind,
          code,
          rarity,
          quantity,
          metadata_json,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM arcade_inventory
        WHERE user_id = ${actingUserId}::uuid
        ORDER BY updated_at DESC
      `;

      const consumption = await sql<any[]>`
        SELECT
          id::text AS id,
          kind,
          code,
          rarity,
          quantity,
          context_type,
          context_id,
          module,
          metadata_json,
          created_at::text AS created_at
        FROM arcade_consumption
        WHERE user_id = ${actingUserId}::uuid
        ORDER BY created_at DESC
        LIMIT 2000
      `;

      const state = await sql<any[]>`
        SELECT key, value_json, created_at::text AS created_at, updated_at::text AS updated_at
        FROM arcade_state
        WHERE user_id = ${actingUserId}::uuid
        ORDER BY updated_at DESC
        LIMIT 200
      `;

      return {
        exported_at: new Date().toISOString(),
        user_id: actingUserId,
        safety_limits: limits ?? null,
        state,
        inventory,
        consumption,
        actions,
      };
    });

    const body = JSON.stringify(data, null, 2);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename=arcade_export_${actingUserId}_${new Date().toISOString().slice(0, 10)}.json`,
      },
    });
  } catch (e) {
    const dep = responseForDbError("arcade_export", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
