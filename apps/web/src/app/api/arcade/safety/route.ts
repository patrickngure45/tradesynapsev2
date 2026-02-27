import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getArcadeSafetyLimits, upsertArcadeSafetyLimits } from "@/lib/arcade/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  self_exclude_hours: z.number().int().min(0).max(24 * 365).optional(),
  daily_action_limit: z.number().int().min(0).max(10_000).nullable().optional(),
  daily_shard_spend_limit: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();

  try {
    const limits = await retryOnceOnTransientDbError(async () => {
      return await getArcadeSafetyLimits(sql, actingUserId);
    });

    return Response.json({ ok: true, limits }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_safety_get", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}

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

  const hours = typeof input.self_exclude_hours === "number" ? Math.max(0, Math.floor(input.self_exclude_hours)) : null;
  const selfExcludedUntil = hours && hours > 0 ? new Date(Date.now() + hours * 3600_000).toISOString() : null;

  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "arcade.safety.update",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const limits = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;
        return await upsertArcadeSafetyLimits(txSql, {
          userId: actingUserId,
          selfExcludedUntil,
          dailyActionLimit: input.daily_action_limit ?? null,
          dailyShardSpendLimit: input.daily_shard_spend_limit ?? null,
        });
      });
    });

    return Response.json({ ok: true, limits }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_safety_post", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
