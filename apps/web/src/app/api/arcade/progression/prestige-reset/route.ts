import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { prestigeReset } from "@/lib/arcade/progression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "arcade.progression.prestige_reset",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;
        return await prestigeReset(txSql, { userId: actingUserId });
      });
    });

    return Response.json({ ok: true, before: result.before, after: result.after }, { status: 200 });
  } catch (e: any) {
    if (e?.code === "prestige_not_available") {
      return apiError("invalid_input", { details: "prestige_not_available" });
    }
    const dep = responseForDbError("arcade_progression_prestige_reset", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
