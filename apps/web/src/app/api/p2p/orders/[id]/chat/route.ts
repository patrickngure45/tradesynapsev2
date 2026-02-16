import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";

const chatSchema = z.object({
  content: z.string().min(1).max(2000),
});

let p2pChatLimiter: PgRateLimiter | null = null;
function getP2PChatLimiter(): PgRateLimiter {
  if (p2pChatLimiter) return p2pChatLimiter;
  const sql = getSql();
  p2pChatLimiter = createPgRateLimiter(sql, {
    name: "p2p-chat",
    windowMs: 60_000,
    max: 60,
  });
  return p2pChatLimiter;
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const userId = getActingUserId(req);
    const authErr = requireActingUserIdInProd(userId);
    if (authErr) return apiError(authErr);
    if (!userId) return apiError("unauthorized", { status: 401 });

    const sql = getSql();
    const activeErr = await requireActiveUser(sql, userId);
    if (activeErr) return apiError(activeErr);

    const rl = await getP2PChatLimiter().consume(`user:${userId}`);
    if (!rl.allowed) {
      return apiError("rate_limit_exceeded", {
        status: 429,
        details: { limit: rl.limit, remaining: rl.remaining, resetMs: rl.resetMs },
      });
    }
    const orderId = params.id;
    const body = await req.json().catch(() => null);
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalid_input", { status: 400, details: parsed.error.issues });
    }
    const content = parsed.data.content.trim();
    if (!content) return apiError("invalid_input", { status: 400 });

    // 1. Validate User Participation
    const orders = await sql`
      SELECT id
      FROM p2p_order
      WHERE id = ${orderId}
        AND (buyer_id = ${userId} OR seller_id = ${userId})
      LIMIT 1
    `;

    if (orders.length === 0) {
      // Return 404 for both not-found and access denied (prevents existence leaks).
      return apiError("order_not_found", { status: 404 });
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
    if (error instanceof Response) return error;
    return apiError("internal_error");
  }
}
