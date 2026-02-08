import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/exchange/orders/history
 *
 * Returns full order history with fill details.
 * Query: ?status=filled|canceled|all  &market_id=uuid  &limit=100
 */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "all";
  const marketId = url.searchParams.get("market_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);

  const sql = getSql();

  try {
    const orders = await sql`
      SELECT
        o.id,
        o.market_id,
        m.symbol AS market_symbol,
        o.side,
        o.type,
        o.price::text,
        o.quantity::text,
        o.remaining_quantity::text,
        o.status,
        o.created_at,
        o.updated_at,
        coalesce(
          (SELECT json_agg(json_build_object(
            'id', e.id,
            'price', e.price::text,
            'quantity', e.quantity::text,
            'maker_fee', e.maker_fee_quote::text,
            'taker_fee', e.taker_fee_quote::text,
            'created_at', e.created_at
          ) ORDER BY e.created_at)
          FROM ex_execution e
          WHERE e.maker_order_id = o.id OR e.taker_order_id = o.id),
          '[]'::json
        ) AS fills
      FROM ex_order o
      JOIN ex_market m ON m.id = o.market_id
      WHERE o.user_id = ${userId}::uuid
        AND (${status} = 'all' OR o.status = ${status})
        AND (${marketId ?? null}::uuid IS NULL OR o.market_id = ${marketId ?? null}::uuid)
      ORDER BY o.created_at DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({ orders });
  } catch (err: unknown) {
    console.error("[order-history] Error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to load order history" }, { status: 500 });
  }
}
