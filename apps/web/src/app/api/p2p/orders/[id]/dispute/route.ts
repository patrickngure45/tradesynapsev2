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

const disputeSchema = z.object({
  reason: z.string().min(5).max(2000),
});

let p2pDisputeLimiter: PgRateLimiter | null = null;
function getP2PDisputeLimiter(): PgRateLimiter {
  if (p2pDisputeLimiter) return p2pDisputeLimiter;
  const sql = getSql();
  p2pDisputeLimiter = createPgRateLimiter(sql, {
    name: "p2p-dispute",
    windowMs: 60_000,
    max: 10,
  });
  return p2pDisputeLimiter;
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

    const rl = await getP2PDisputeLimiter().consume(`user:${userId}`);
    if (!rl.allowed) {
      return apiError("rate_limit_exceeded", {
        status: 429,
        details: { limit: rl.limit, remaining: rl.remaining, resetMs: rl.resetMs },
      });
    }

    const body = await request.json().catch(() => null);
    const parsed = disputeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalid_input", { status: 400, details: parsed.error.issues });
    }
    const reason = parsed.data.reason.trim();
    if (!reason) return apiError("invalid_input", { status: 400 });

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

      if (order.status === "completed" || order.status === "cancelled") {
        return apiError("trade_not_disputable", { status: 409 });
      }
      if (order.status === "disputed") {
        return apiError("dispute_already_exists", { status: 409 });
      }

      // Create dispute row (enforced unique per order).
      const disputeRows = (await tx`
        INSERT INTO p2p_dispute (order_id, opened_by_user_id, reason, status)
        VALUES (${orderId}::uuid, ${userId}::uuid, ${reason}, 'open')
        ON CONFLICT (order_id) DO NOTHING
        RETURNING id
      `) as { id: string }[];

      if (disputeRows.length === 0) {
        return apiError("dispute_already_exists", { status: 409 });
      }

      // Mark order as disputed.
      await tx`
        UPDATE p2p_order
        SET status = 'disputed'
        WHERE id = ${orderId}::uuid
      `;

      await tx`
        INSERT INTO p2p_chat_message (order_id, sender_id, content, metadata)
        VALUES (
          ${orderId}::uuid,
          NULL,
          'System: Dispute opened. Support will review this order.',
          ${JSON.stringify({ type: "dispute_opened" })}::jsonb
        )
      `;

      const counterpartyId = userId === order.buyer_id ? order.seller_id : order.buyer_id;
      await createNotification(tx, {
        userId: counterpartyId,
        type: "p2p_dispute_opened",
        title: "Dispute opened",
        body: `A dispute was opened for order ${orderId.slice(0, 8)}.`,
        metadata: { order_id: orderId },
      });

      await writeAuditLog(tx as any, {
        actorId: userId,
        actorType: "user",
        action: "p2p.dispute.opened",
        resourceType: "p2p_order",
        resourceId: orderId,
        detail: { order_id: orderId, dispute_id: disputeRows[0]!.id, reason },
        ...auditCtx,
      });

      return Response.json({ ok: true, dispute_id: disputeRows[0]!.id });
    });
  } catch (e) {
    console.error("[POST /api/p2p/orders/:id/dispute] error", e);
    if (e instanceof Response) return e;
    return apiError("internal_error");
  }
}
