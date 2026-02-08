
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
      await sql`
        UPDATE p2p_order 
        SET status = 'paid_confirmed' 
        WHERE id = ${orderId}
      `;
      
      await sql`
        INSERT INTO p2p_chat_message (order_id, sender_id, content)
        VALUES (${orderId}, NULL, 'Buyer has marked the order as PAID.')
      `;
      
      return NextResponse.json({ success: true });
  } catch (err: any) {
      return apiError("internal_error", { details: err.message });
  }
}
