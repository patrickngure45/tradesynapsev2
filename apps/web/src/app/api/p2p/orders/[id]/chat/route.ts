import { NextRequest, NextResponse } from "next/server";
import { getActingUserId } from "@/lib/auth/party";
import { getSql } from "@/lib/db";

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
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: "Message content required" }, { status: 400 });
    }

    // 1. Validate User Participation
    const orders = await sql`
      SELECT id FROM p2p_order WHERE id = ${orderId} AND (buyer_id = ${userId} OR seller_id = ${userId})
    `;

    if (orders.length === 0) {
      return NextResponse.json({ error: "Order not found or access denied" }, { status: 403 });
    }

    // 2. Insert Message
    const inserted = await sql`
      INSERT INTO p2p_chat_message (order_id, sender_id, content) 
      VALUES (${orderId}, ${userId}, ${content}) 
      RETURNING *
    `;

    return NextResponse.json(inserted[0]);

  } catch (error) {
    console.error("Error sending chat message:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
