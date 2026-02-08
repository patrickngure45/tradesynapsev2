import { NextRequest, NextResponse } from "next/server";
import { getActingUserId } from "@/lib/auth/party";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
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

    // 1. Fetch Order
    const orders = await sql`
      SELECT o.*, 
        
        -- Buyer Info
        buyer.id as buyer_id,
        buyer.email as buyer_email,
        
        -- Seller Info
        seller.id as seller_id,
        seller.email as seller_email,
        
        -- Asset Info
        asset.symbol as asset_symbol,
        asset.decimals as asset_decimals,

        -- Ad Snapshot Info
        ad.terms as ad_terms,
        ad.payment_window_minutes,
        ad.auto_reply,
        ad.payment_method_ids

      FROM p2p_order o
      JOIN app_user buyer ON o.buyer_id = buyer.id
      JOIN app_user seller ON o.seller_id = seller.id
      JOIN ex_asset asset ON o.asset_id = asset.id
      JOIN p2p_ad ad ON o.ad_id = ad.id
      WHERE o.id = ${orderId} AND (o.buyer_id = ${userId} OR o.seller_id = ${userId})
    `;

    if (orders.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orders[0];

    // 2. Fetch Chat Messages
    const messages = await sql`
      SELECT 
        m.id,
        m.order_id,
        m.sender_id,
        m.content,
        m.is_image,
        m.created_at,
        sender.email as sender_email
      FROM p2p_chat_message m
      LEFT JOIN app_user sender ON m.sender_id = sender.id
      WHERE m.order_id = ${orderId}
      ORDER BY m.created_at ASC
    `;

    return NextResponse.json({ order, messages });
  } catch (error) {
    console.error("Error fetching P2P order:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
