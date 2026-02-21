import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getProgressionState, nextTierXp } from "@/lib/arcade/progression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();

  try {
    const state = await retryOnceOnTransientDbError(async () => {
      return await getProgressionState(sql, actingUserId);
    });

    return Response.json(
      {
        ok: true,
        progression: {
          xp: state.xp,
          tier: state.tier,
          prestige: state.prestige,
          next_tier_xp: nextTierXp(state.tier),
        },
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_progression_get", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
