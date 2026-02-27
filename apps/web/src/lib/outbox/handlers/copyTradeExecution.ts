/**
 * Outbox handler: copy-trade execution
 *
 * When a leader places an order (ex.order.placed), this handler
 * mirrors proportional orders for all active followers.
 *
 * Mirrored orders are placed as limit orders at the same price,
 * scaled by the follower's copy_ratio and capped at max_per_trade.
 *
 * This is best-effort: if a follower lacks balance, the order fails
 * silently and a notification is sent.
 */
import type { Sql } from "postgres";

import { getActiveSubscriptionsForLeader } from "@/lib/exchange/copyTrading";
import { createNotification } from "@/lib/notifications";

type OrderPayload = {
  id: string;
  user_id: string;
  market_id: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: string | null;
  original_quantity: string;
  status: string;
};

type CopyTradeResult = {
  follower_user_id: string;
  success: boolean;
  order_id?: string;
  error?: string;
};

/**
 * Mirror a leader's order to all active followers.
 * Called by the outbox worker on `ex.order.placed` events.
 */
export async function handleCopyTradeExecution(
  sql: Sql,
  opts: {
    order: OrderPayload;
    baseUrl?: string;
  },
): Promise<CopyTradeResult[]> {
  const { order } = opts;

  // Only mirror limit orders (market orders are instant / risky to copy)
  if (order.type !== "limit" || !order.price) return [];

  // Get all active followers for this leader
  const subs = await getActiveSubscriptionsForLeader(sql, order.user_id);
  if (subs.length === 0) return [];

  const results: CopyTradeResult[] = [];

  for (const sub of subs) {
    const copyRatio = parseFloat(sub.copy_ratio) || 1.0;
    const rawQty = parseFloat(order.original_quantity) * copyRatio;
    const maxPerTrade = sub.max_per_trade ? parseFloat(sub.max_per_trade) : Infinity;
    const cappedQty = Math.min(rawQty, maxPerTrade);

    if (cappedQty <= 0) {
      results.push({ follower_user_id: sub.follower_user_id, success: false, error: "zero_quantity" });
      continue;
    }

    // Format to 18 decimals for the order API (mirroring fixed3818 format)
    const quantity = cappedQty.toFixed(18);

    try {
      // Place order directly via SQL (same logic as the orders API route)
      // but simplified — we insert the order and let the matching engine
      // pick it up on the next match cycle.
      const placed = await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        // Verify follower has a ledger account
        const market = await txSql<{ id: string; base_asset_id: string; quote_asset_id: string; symbol: string }[]>`
          SELECT id, base_asset_id::text, quote_asset_id::text, symbol
          FROM ex_market WHERE id = ${order.market_id} AND status = 'active'
          LIMIT 1
        `;
        if (market.length === 0) return { success: false, error: "market_not_found" };

        // Determine which asset needs to be held
        const m = market[0]!;
        const holdAssetId = order.side === "buy" ? m.quote_asset_id : m.base_asset_id;

        // Check available balance
        const balRows = await txSql<{ available: string }[]>`
          SELECT
            (COALESCE(
              (SELECT sum(jl.amount) FROM ex_journal_line jl WHERE jl.account_id = la.id AND jl.asset_id = ${holdAssetId}),
              0
            ) - COALESCE(
              (SELECT sum(h.remaining_amount) FROM ex_hold h WHERE h.account_id = la.id AND h.asset_id = ${holdAssetId} AND h.status = 'active'),
              0
            ))::text AS available
          FROM ex_ledger_account la
          WHERE la.user_id = ${sub.follower_user_id}::uuid AND la.asset_id = ${holdAssetId}::uuid
        `;

        if (balRows.length === 0 || parseFloat(balRows[0]!.available) <= 0) {
          return { success: false, error: "insufficient_balance" };
        }

        // Insert copied order
        const orderRows = await txSql<{ id: string }[]>`
          INSERT INTO ex_order (
            user_id, market_id, side, type, price, original_quantity,
            remaining_quantity, status, time_in_force, metadata_json
          ) VALUES (
            ${sub.follower_user_id}::uuid, ${order.market_id}::uuid,
            ${order.side}, 'limit', ${order.price}::numeric, ${quantity}::numeric,
            ${quantity}::numeric, 'open', 'GTC',
            ${JSON.stringify({ copied_from_order: order.id, leader_user_id: order.user_id, copy_ratio: copyRatio })}::jsonb
          )
          RETURNING id
        `;

        if (orderRows.length === 0) return { success: false, error: "insert_failed" };

        // Create hold for the order
        const holdAmount = order.side === "buy"
          ? (parseFloat(quantity) * parseFloat(order.price!)).toFixed(18)
          : quantity;

        const acct = await txSql<{ id: string }[]>`
          SELECT id FROM ex_ledger_account
          WHERE user_id = ${sub.follower_user_id}::uuid AND asset_id = ${holdAssetId}::uuid
          LIMIT 1
        `;

        if (acct.length > 0) {
          await txSql`
            INSERT INTO ex_hold (account_id, asset_id, amount, remaining_amount, reason, status)
            VALUES (
              ${acct[0]!.id}, ${holdAssetId}::uuid, ${holdAmount}::numeric,
              ${holdAmount}::numeric, ${"order:" + orderRows[0]!.id}, 'active'
            )
          `;
        }

        return { success: true, order_id: orderRows[0]!.id };
      });

      results.push({ follower_user_id: sub.follower_user_id, ...placed });

      if (placed.success) {
        await createNotification(sql, {
          userId: sub.follower_user_id,
          type: "order_filled", // reusing existing type
          title: "Copy Trade Placed",
          body: `Copied ${order.side} order: ${cappedQty} at ${order.price} (from leader)`,
          metadata: {
            copied_order_id: placed.order_id,
            leader_order_id: order.id,
            copy_ratio: copyRatio,
          },
        });
      } else if (placed.error === "insufficient_balance") {
        await createNotification(sql, {
          userId: sub.follower_user_id,
          type: "system",
          title: "Copy Trade Skipped",
          body: `Insufficient balance to copy ${order.side} order (${cappedQty} at ${order.price})`,
          metadata: { leader_order_id: order.id, reason: "insufficient_balance" },
        });
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      results.push({ follower_user_id: sub.follower_user_id, success: false, error: errMsg });
    }
  }

  return results;
}
