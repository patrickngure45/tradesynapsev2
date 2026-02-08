import { NextRequest, NextResponse } from "next/server";
import { getActingUserId } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const userId = getActingUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const sql = getSql();
    const orderId = params.id;
    const body = await req.json();
    const { action } = body; // PAY_CONFIRMED, RELEASE, CANCEL

    return await sql.begin(async (txArg) => {
      const tx = txArg as any;
      // 1. Fetch Order and Lock
      const [order] = await tx`
        SELECT * FROM p2p_order WHERE id = ${orderId} FOR UPDATE
      `;
      if (!order) throw new Error("Order not found");

      const isBuyer = order.buyer_id === userId;
      const isSeller = order.seller_id === userId;

      if (!isBuyer && !isSeller) {
        throw new Error("Unauthorized");
      }

      let updatedOrder;

      // --- PAY_CONFIRMED ---
      if (action === 'PAY_CONFIRMED') {
        if (!isBuyer) throw new Error("Only buyer can confirm payment");
        if (order.status !== 'created') throw new Error("Invalid state for payment confirmation");

        [updatedOrder] = await tx`
          UPDATE p2p_order 
          SET status = 'paid_confirmed', paid_at = now()
          WHERE id = ${orderId}
          RETURNING *
        `;
        
        // System message
        await tx`
          INSERT INTO p2p_chat_message (order_id, content) 
          VALUES (${orderId}, 'Buyer has marked as paid. Seller please verify.')
        `;
        
        await createNotification(tx, {
          userId: order.seller_id,
          type: "p2p_payment_confirmed",
          title: "Payment Marked as Sent",
          body: `Buyer marked order ${orderId.slice(0,8)} as paid. Please check your bank.`,
          metadata: { order_id: orderId }
        });
      }

      // --- RELEASE (Finalize) ---
      else if (action === 'RELEASE') {
        if (!isSeller) throw new Error("Only seller can release");
        if (order.status !== 'paid_confirmed' && order.status !== 'created') throw new Error("Invalid state for release");

        // Ensure Buyer Account Exists
        await tx`
          INSERT INTO ex_ledger_account (user_id, asset_id, status)
          VALUES (${order.buyer_id}, ${order.asset_id}, 'active')
          ON CONFLICT (user_id, asset_id) DO NOTHING
        `;
        
        // Debit Locked from Seller (It's already out of 'balance')
         await tx`
          UPDATE ex_ledger_account 
          SET locked = locked - ${order.amount_asset}
          WHERE user_id = ${order.seller_id} AND asset_id = ${order.asset_id}
        `;
        
        // Credit Balance to Buyer
        await tx`
           UPDATE ex_ledger_account
           SET balance = balance + ${order.amount_asset}
           WHERE user_id = ${order.buyer_id} AND asset_id = ${order.asset_id}
        `;
        
        [updatedOrder] = await tx`
          UPDATE p2p_order 
          SET status = 'completed', completed_at = now()
          WHERE id = ${orderId}
          RETURNING *
        `;
        
         // System message
        await tx`
          INSERT INTO p2p_chat_message (order_id, content) 
          VALUES (${orderId}, 'System: Crypto released to buyer. Order completed.')
        `;
        
        await createNotification(tx, {
          userId: order.buyer_id,
          type: "p2p_order_completed",
          title: "Order Completed",
          body: `Seller released ${order.amount_asset} ${order.asset_symbol} to your wallet.`,
          metadata: { order_id: orderId }
        });
      }

      // --- CANCEL ---
      else if (action === 'CANCEL') {
        if (order.status === 'completed' || order.status === 'cancelled') throw new Error("Order already finalized");
        
        // Only Buyer can cancel manually unless specific conditions (skipping complex ACL for now)
        // If Seller tries to cancel, we should check if they can (e.g. timeout or buyer not paid)
        // For MVP: Allow Buyer to Cancel anytime. Allow Seller ONLY if not paid?
        // Let's stick to Buyer cancels. If Seller wants to cancel, they must Appeal.
        // Actually, if status is 'created' and timeout passed, anyone can cancel.
        // Simplified: Buyer can cancel.
        
        if (!isBuyer) {
            // Check if seller and timed out?
            // Ignoring for MVP simplicity. Only Buyer cancels.
            throw new Error("Only Buyer can cancel active order");
        }

        // Restore Funds to Seller
        // Move from Locked -> Balance
        await tx`
          UPDATE ex_ledger_account 
          SET 
            locked = locked - ${order.amount_asset},
            balance = balance + ${order.amount_asset}
          WHERE user_id = ${order.seller_id} AND asset_id = ${order.asset_id}
        `;
        
        // Restore Ad Liquidity
        await tx`
           UPDATE p2p_ad
           SET remaining_amount = remaining_amount + ${order.amount_asset}
           WHERE id = ${order.ad_id}
        `;

        [updatedOrder] = await tx`
          UPDATE p2p_order 
          SET status = 'cancelled', cancelled_at = now()
          WHERE id = ${orderId}
          RETURNING *
        `;
        
        // System message
        await tx`
          INSERT INTO p2p_chat_message (order_id, content) 
          VALUES (${orderId}, 'System: Order cancelled by buyer.')
        `;
        
        await createNotification(tx, {
          userId: order.seller_id,
          type: "p2p_order_cancelled",
          title: "Order Cancelled",
          body: `Order ${orderId.slice(0,8)} was cancelled by the buyer. Funds returned to your available balance.`,
          metadata: { order_id: orderId }
        });
      }
      
      else {
        throw new Error("Invalid action");
      }

      return NextResponse.json(updatedOrder);
    });

  } catch (error) {
    console.error("Error performing order action:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Error" }, { status: 400 });
  }
}
