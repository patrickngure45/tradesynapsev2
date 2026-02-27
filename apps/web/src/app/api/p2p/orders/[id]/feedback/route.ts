import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { getSql } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  rating: z.enum(["positive", "negative"]),
  comment: z.string().max(2000).optional(),
});

let p2pFeedbackLimiter: PgRateLimiter | null = null;
function getP2PFeedbackLimiter(): PgRateLimiter {
  if (p2pFeedbackLimiter) return p2pFeedbackLimiter;
  const sql = getSql();
  p2pFeedbackLimiter = createPgRateLimiter(sql, {
    name: "p2p-feedback",
    windowMs: 60_000,
    max: 20,
  });
  return p2pFeedbackLimiter;
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const sql = getSql();

  try {
    const params = await props.params;
    const orderId = params.id;
    const userId = getActingUserId(request);
    const authErr = requireActingUserIdInProd(userId);
    if (authErr) return apiError(authErr);
    if (!userId) return apiError("unauthorized", { status: 401 });

    const activeErr = await requireActiveUser(sql, userId);
    if (activeErr) return apiError(activeErr);

    const rl = await getP2PFeedbackLimiter().consume(`user:${userId}`);
    if (!rl.allowed) {
      return apiError("rate_limit_exceeded", {
        status: 429,
        details: { limit: rl.limit, remaining: rl.remaining, resetMs: rl.resetMs },
      });
    }

    const body = await request.json().catch(() => null);
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalid_input", { status: 400, details: parsed.error.issues });
    }

    const rating = parsed.data.rating;
    const comment = (parsed.data.comment ?? "").trim();

    const auditCtx = auditContextFromRequest(request);

    return await sql.begin(async (tx: any) => {
      const orders = (await tx`
        SELECT id::text, status, buyer_id::text, seller_id::text
        FROM p2p_order
        WHERE id = ${orderId}::uuid
          AND (buyer_id = ${userId}::uuid OR seller_id = ${userId}::uuid)
        FOR UPDATE
      `) as { id: string; status: string; buyer_id: string; seller_id: string }[];
      if (orders.length === 0) return apiError("order_not_found", { status: 404 });

      const order = orders[0]!;
      if (order.status !== "completed") {
        return apiError("trade_state_conflict", { status: 409 });
      }

      const toUserId = userId === order.buyer_id ? order.seller_id : order.buyer_id;

      const existing = await tx`
        SELECT id
        FROM p2p_feedback
        WHERE order_id = ${orderId}::uuid
          AND from_user_id = ${userId}::uuid
        LIMIT 1
      `;
      if (existing.length > 0) {
        return apiError("invalid_input", {
          status: 409,
          details: { message: "Feedback already submitted for this order." },
        });
      }

      const rows = (await tx`
        INSERT INTO p2p_feedback (order_id, from_user_id, to_user_id, rating, comment)
        VALUES (${orderId}::uuid, ${userId}::uuid, ${toUserId}::uuid, ${rating}, ${comment || null})
        RETURNING id
      `) as { id: string }[];

      await createNotification(tx, {
        userId: toUserId,
        type: "p2p_feedback_received",
        title: "New P2P feedback",
        body: `You received ${rating} feedback for order ${orderId.slice(0, 8)}.`,
        metadata: { order_id: orderId, rating },
      });

      await writeAuditLog(tx as any, {
        actorId: userId,
        actorType: "user",
        action: "p2p.feedback.submitted",
        resourceType: "p2p_order",
        resourceId: orderId,
        detail: { order_id: orderId, rating, to_user_id: toUserId },
        ...auditCtx,
      });

      return Response.json({ ok: true, feedback_id: rows[0]!.id });
    });
  } catch (e) {
    console.error("[POST /api/p2p/orders/:id/feedback] error", e);
    if (e instanceof Response) return e;
    return apiError("internal_error");
  }
}
