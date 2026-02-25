import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { requireSessionUserId } from "@/lib/auth/sessionGuard";
import { getSql } from "@/lib/db";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";

const chatSchema = z.union([
  z.object({
    content: z.string().min(1).max(2000),
  }),
  z.object({
    image_data_url: z.string().min(1).max(1_500_000),
    filename: z.string().min(1).max(120).optional(),
  }),
]);

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
    const sql = getSql();

    const authed = await requireSessionUserId(sql as any, req);
    if (!authed.ok) return authed.response;
    const userId = authed.userId;

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

    let content = "";
    let isImage = false;
    let metadata: Record<string, unknown> = {};
    if ("image_data_url" in parsed.data) {
      const dataUrl = String(parsed.data.image_data_url || "").trim();
      if (!dataUrl) return apiError("invalid_input", { status: 400 });
      if (!dataUrl.startsWith("data:image/")) return apiError("invalid_input", { status: 400, details: { field: "image_data_url" } });
      if (!dataUrl.includes(";base64,")) return apiError("invalid_input", { status: 400, details: { field: "image_data_url" } });
      content = dataUrl;
      isImage = true;
      metadata = {
        type: "image_evidence",
        filename: parsed.data.filename ? String(parsed.data.filename) : null,
      };
    } else {
      content = parsed.data.content.trim();
      if (!content) return apiError("invalid_input", { status: 400 });
    }

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
      INSERT INTO p2p_chat_message (order_id, sender_id, content, is_image, metadata)
      VALUES (${orderId}, ${userId}, ${content}, ${isImage}, ${JSON.stringify(metadata)}::jsonb)
      RETURNING *
    `;

    return NextResponse.json(inserted[0]);

  } catch (error) {
    console.error("Error sending chat message:", error);
    if (error instanceof Response) return error;
    return apiError("internal_error");
  }
}
