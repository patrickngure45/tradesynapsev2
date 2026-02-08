
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
      return apiError("not_found", { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  if (!orderId) return apiError("missing_order_id");

  const sql = getSql();
  
  try {
      // 1. Get Order info (amount, buyer_id)
      const [order] = await sql`SELECT * FROM p2p_order WHERE id = ${orderId}`;
      if (!order) throw new Error("Order not found");

      // 2. Transact: Release funds
      await sql.begin(async (txArg) => {
          const tx = txArg as any;
          // Unlock from Seller (Move from Locked to Buyer Balance)
          // Actually, earlier in route.ts, we moved from Seller Balance -> Seller Locked.
          // Now we move Seller Locked -> Buyer Balance.
          
          // Seller ID is order.seller_id
          // Buyer ID is order.buyer_id
          // Asset is order.asset_id
          
          await tx`
            UPDATE ex_ledger_account
            SET locked = locked - ${order.amount_asset}
            WHERE user_id = ${order.seller_id} AND asset_id = ${order.asset_id}
          `;
          
          await tx`
            INSERT INTO ex_ledger_account (user_id, asset_id, balance, locked)
            VALUES (${order.buyer_id}, ${order.asset_id}, ${order.amount_asset}, 0)
            ON CONFLICT (user_id, asset_id) 
            DO UPDATE SET balance = ex_ledger_account.balance + ${order.amount_asset}
          `;

          await tx`
            UPDATE p2p_order 
            SET status = 'completed' 
            WHERE id = ${orderId}
          `;
          
          await tx`
            INSERT INTO p2p_chat_message (order_id, sender_id, content)
            VALUES (${orderId}, NULL, 'Seller released crypto. Order completed.')
          `;
      });
      
      return NextResponse.json({ success: true });
  } catch (err: any) {
      return apiError("internal_error", { details: err.message });
  }
}
