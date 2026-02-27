import { type NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actingUserId = getActingUserId(req);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  const sql = getSql();
  try {
    const ads = await sql`
      SELECT
        ad.id,
        ad.user_id,
        ad.side,
        ad.fiat_currency,
        ad.price_type,
        ad.fixed_price,
        ad.margin_percent,
        ad.total_amount,
        ad.remaining_amount,
        ad.min_limit,
        ad.max_limit,
        ad.payment_method_ids,
        ad.payment_window_minutes,
        ad.terms,
        ad.status,
        ad.created_at,
        ad.updated_at,
        ad.highlighted_until,
        ad.inventory_hold_id,
        a.symbol AS asset_symbol
      FROM p2p_ad ad
      JOIN ex_asset a ON a.id = ad.asset_id
      WHERE ad.user_id = ${actingUserId}::uuid
      ORDER BY ad.created_at DESC
      LIMIT 200
    `;

    return NextResponse.json({ ads });
  } catch (error: any) {
    return apiError("internal_error", { details: error?.message ?? String(error) });
  }
}
