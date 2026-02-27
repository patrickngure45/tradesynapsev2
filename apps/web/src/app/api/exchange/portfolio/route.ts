import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/exchange/portfolio
 *
 * Returns a portfolio summary for the acting user:
 *  - All asset balances (posted, held, available)
 *  - Total trade count + volume
 *  - Recent execution history
 *  - Estimated PnL from executions
 */
export async function GET(req: Request) {
  const actingUserId = getActingUserId(req);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    // 1. All balances across all assets
    const balances = await retryOnceOnTransientDbError(async () => {
      return await sql`
      WITH accts AS (
        SELECT id, asset_id
        FROM ex_ledger_account
        WHERE user_id = ${actingUserId}::uuid
      )
      SELECT
        a.asset_id,
        asset.symbol AS asset_symbol,
        p.posted::text AS posted,
        h.held::text AS held,
        (p.posted - h.held)::text AS available
      FROM accts a
      JOIN ex_asset asset ON asset.id = a.asset_id
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        WHERE account_id = a.id
      ) p ON true
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE account_id = a.id AND status = 'active'
      ) h ON true
      WHERE (p.posted <> 0) OR (h.held <> 0)
      ORDER BY asset.symbol
    `;
    });

    // 2. Trade stats (fills where user is buyer or seller)
    const stats = await retryOnceOnTransientDbError(async () => {
      return await sql`
      SELECT
        count(*)::int AS total_fills,
        coalesce(sum(e.quantity * e.price), 0)::text AS total_volume,
        count(DISTINCT e.id) FILTER (WHERE e.created_at > now() - interval '24 hours')::int AS fills_24h
      FROM ex_execution e
      JOIN ex_order o ON o.id = e.taker_order_id OR o.id = e.maker_order_id
      WHERE o.user_id = ${actingUserId}::uuid
    `;
    });

    // 3. Recent executions (last 50)
    const recentFills = await retryOnceOnTransientDbError(async () => {
      return await sql`
      SELECT
        e.id AS execution_id,
        e.price::text AS price,
        e.quantity::text AS quantity,
        (e.price * e.quantity)::text AS quote_amount,
        m.symbol AS market_symbol,
        o.side,
        CASE WHEN o.id = e.maker_order_id THEN 'maker' ELSE 'taker' END AS role,
        e.created_at
      FROM ex_execution e
      JOIN ex_order o ON o.id = e.taker_order_id OR o.id = e.maker_order_id
      JOIN ex_market m ON m.id = o.market_id
      WHERE o.user_id = ${actingUserId}::uuid
      ORDER BY e.created_at DESC
      LIMIT 50
    `;
    });

    // 4. Open orders count
    const openOrders = await retryOnceOnTransientDbError(async () => {
      return await sql`
      SELECT count(*)::int AS count
      FROM ex_order
      WHERE user_id = ${actingUserId}::uuid
        AND status IN ('open', 'partially_filled')
    `;
    });

    // 5. PnL estimate: sum of (sell value - buy value) for each completed round trip
    //    Simplified: total quote received from sells - total quote spent on buys
    const pnl = await retryOnceOnTransientDbError(async () => {
      return await sql`
      WITH user_fills AS (
        SELECT
          o.side,
          e.price * e.quantity AS quote_value,
          CASE WHEN o.id = e.maker_order_id THEN 'maker' ELSE 'taker' END AS role,
          CASE WHEN o.id = e.maker_order_id THEN e.maker_fee_quote ELSE e.taker_fee_quote END AS fee
        FROM ex_execution e
        JOIN ex_order o ON o.id = e.taker_order_id OR o.id = e.maker_order_id
        WHERE o.user_id = ${actingUserId}::uuid
      )
      SELECT
        coalesce(sum(CASE WHEN side = 'sell' THEN quote_value ELSE 0 END), 0)::text AS total_sold,
        coalesce(sum(CASE WHEN side = 'buy' THEN quote_value ELSE 0 END), 0)::text AS total_bought,
        coalesce(sum(fee), 0)::text AS total_fees,
        (
          coalesce(sum(CASE WHEN side = 'sell' THEN quote_value ELSE 0 END), 0) -
          coalesce(sum(CASE WHEN side = 'buy' THEN quote_value ELSE 0 END), 0) -
          coalesce(sum(fee), 0)
        )::text AS realized_pnl
      FROM user_fills
    `;
    });

    return Response.json({
      ok: true,
      balances: balances.map((b) => ({
        assetId: b.asset_id,
        symbol: b.asset_symbol,
        posted: b.posted,
        held: b.held,
        available: b.available,
      })),
      stats: {
        totalFills: stats[0]?.total_fills ?? 0,
        totalVolume: stats[0]?.total_volume ?? "0",
        fills24h: stats[0]?.fills_24h ?? 0,
        openOrders: openOrders[0]?.count ?? 0,
      },
      pnl: {
        totalSold: pnl[0]?.total_sold ?? "0",
        totalBought: pnl[0]?.total_bought ?? "0",
        totalFees: pnl[0]?.total_fees ?? "0",
        realizedPnl: pnl[0]?.realized_pnl ?? "0",
      },
      recentFills: recentFills.map((f) => ({
        executionId: f.execution_id,
        market: f.market_symbol,
        side: f.side,
        role: f.role,
        price: f.price,
        quantity: f.quantity,
        quoteAmount: f.quote_amount,
        createdAt: f.created_at,
      })),
      ts: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const resp = responseForDbError("exchange.portfolio", err);
    if (resp) return resp;
    console.error("[portfolio] Error:", err instanceof Error ? err.message : String(err));
    return apiError("internal_error", { status: 500 });
  }
}
