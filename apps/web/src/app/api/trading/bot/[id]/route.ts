import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const { id } = await ctx.params;

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const [row] = await sql`
      SELECT
        id,
        user_id,
        kind,
        status,
        signal_id,
        exchange,
        symbol,
        amount_usd,
        leverage,
        params_json,
        result_json,
        error,
        created_at,
        started_at,
        finished_at
      FROM trading_bot_execution
      WHERE id = ${id}::uuid AND user_id = ${actingUserId}::uuid
      LIMIT 1
    `;

    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ execution: row });
  } catch (e) {
    console.error("[bot] Error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
