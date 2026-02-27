import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { getSql } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resolveSchema = z.object({
  outcome: z.enum(["release", "cancel"]),
  note: z.string().max(2000).optional(),
});

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  try {
    const params = await props.params;
    const disputeId = params.id;

    const body = await request.json().catch(() => null);
    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalid_input", { status: 400, details: parsed.error.issues });
    }
    const outcome = parsed.data.outcome;
    const note = (parsed.data.note ?? "").trim();

    const auditCtx = auditContextFromRequest(request);

    return await sql.begin(async (tx: any) => {
      const disputes = (await tx`
        SELECT id::text, order_id::text, status
        FROM p2p_dispute
        WHERE id = ${disputeId}::uuid
        FOR UPDATE
      `) as { id: string; order_id: string; status: string }[];
      if (disputes.length === 0) return apiError("dispute_not_found", { status: 404 });
      const dispute = disputes[0]!;
      if (dispute.status !== "open") return apiError("dispute_not_open", { status: 409 });

      const orders = (await tx`
        SELECT
          o.id::text,
          o.ad_id::text,
          o.status,
          o.buyer_id::text,
          o.seller_id::text,
          o.asset_id::text,
          o.amount_asset::text,
          o.amount_fiat::text,
          o.fiat_currency,
          o.escrow_hold_id::text,
          a.symbol AS asset_symbol
        FROM p2p_order o
        JOIN ex_asset a ON a.id = o.asset_id
        WHERE o.id = ${dispute.order_id}::uuid
        FOR UPDATE
      `) as {
        id: string;
        ad_id: string;
        status: string;
        buyer_id: string;
        seller_id: string;
        asset_id: string;
        amount_asset: string;
        amount_fiat: string;
        fiat_currency: string;
        escrow_hold_id: string | null;
        asset_symbol: string;
      }[];
      if (orders.length === 0) return apiError("order_not_found", { status: 404 });
      const order = orders[0]!;

      if (order.status === "completed" || order.status === "cancelled") {
        // Dispute exists but order is already final; resolve dispute without touching ledger.
        await tx`
          UPDATE p2p_dispute
          SET status = 'resolved', resolved_by_user_id = ${admin.userId}::uuid,
              resolution_note = ${note || null}, resolution_outcome = ${outcome},
              resolved_at = now()
          WHERE id = ${disputeId}::uuid
        `;

        await writeAuditLog(tx as any, {
          actorId: admin.userId,
          actorType: "admin",
          action: "p2p.dispute.resolved",
          resourceType: "p2p_order",
          resourceId: order.id,
          detail: { order_id: order.id, dispute_id: disputeId, outcome, note, order_status: order.status },
          ...auditCtx,
        });

        return Response.json({ ok: true, order_id: order.id, status: order.status });
      }

      if (outcome === "cancel") {
        if (order.escrow_hold_id) {
          await tx`
            UPDATE ex_hold
            SET status = 'released', released_at = now()
            WHERE id = ${order.escrow_hold_id}::uuid AND status = 'active'
          `;
        }

        await tx`
          UPDATE p2p_ad
          SET remaining_amount = remaining_amount + ${order.amount_asset}::numeric
          WHERE id = ${order.ad_id}::uuid
        `;

        await tx`
          UPDATE p2p_order
          SET status = 'cancelled', cancelled_at = now()
          WHERE id = ${order.id}::uuid
        `;

        await tx`
          INSERT INTO p2p_chat_message (order_id, sender_id, content, metadata)
          VALUES (
            ${order.id}::uuid,
            NULL,
            'System: Dispute resolved. Order was cancelled by support.',
            ${JSON.stringify({ type: "dispute_resolved", outcome: "cancel" })}::jsonb
          )
        `;

        await tx`
          UPDATE p2p_dispute
          SET status = 'resolved', resolved_by_user_id = ${admin.userId}::uuid,
              resolution_note = ${note || null}, resolution_outcome = 'cancel',
              resolved_at = now()
          WHERE id = ${disputeId}::uuid
        `;

        await createNotification(tx, {
          userId: order.buyer_id,
          type: "p2p_dispute_resolved",
          title: "Dispute resolved",
          body: `Support cancelled order ${order.id.slice(0, 8)}.`,
          metadata: { order_id: order.id, outcome: "cancel" },
        });
        await createNotification(tx, {
          userId: order.seller_id,
          type: "p2p_dispute_resolved",
          title: "Dispute resolved",
          body: `Support cancelled order ${order.id.slice(0, 8)}.`,
          metadata: { order_id: order.id, outcome: "cancel" },
        });

        await writeAuditLog(tx as any, {
          actorId: admin.userId,
          actorType: "admin",
          action: "p2p.dispute.resolved",
          resourceType: "p2p_order",
          resourceId: order.id,
          detail: { order_id: order.id, dispute_id: disputeId, outcome: "cancel", note },
          ...auditCtx,
        });

        return Response.json({ ok: true, order_id: order.id, status: "cancelled" });
      }

      // outcome === 'release'
      if (!order.escrow_hold_id) {
        return apiError("trade_state_conflict", {
          status: 409,
          details: { message: "No escrow hold exists for this order." },
        });
      }

      // Ensure accounts exist
      const sellerAcctRows = (await tx`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${order.seller_id}::uuid, ${order.asset_id}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `) as { id: string }[];
      const buyerAcctRows = (await tx`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${order.buyer_id}::uuid, ${order.asset_id}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `) as { id: string }[];
      const sellerAccountId = sellerAcctRows[0]!.id;
      const buyerAccountId = buyerAcctRows[0]!.id;

      const holds = (await tx`
        SELECT id::text, account_id::text, asset_id::text, amount::text, status
        FROM ex_hold
        WHERE id = ${order.escrow_hold_id}::uuid
        FOR UPDATE
      `) as { id: string; account_id: string; asset_id: string; amount: string; status: string }[];
      const hold = holds[0];
      if (!hold) {
        return apiError("trade_state_conflict", {
          status: 409,
          details: { message: "Escrow hold missing." },
        });
      }
      if (hold.status !== "active") {
        return apiError("trade_state_conflict", {
          status: 409,
          details: { message: "Escrow hold is not active." },
        });
      }
      if (hold.account_id !== String(sellerAccountId)) {
        return apiError("trade_state_conflict", {
          status: 409,
          details: { message: "Escrow hold account mismatch." },
        });
      }

      const invariantRows = (await tx`
        SELECT (
          (${hold.asset_id}::uuid = ${order.asset_id}::uuid)
          AND (${hold.amount}::numeric = ${order.amount_asset}::numeric)
        ) AS ok
      `) as { ok: boolean }[];
      if (!invariantRows[0]?.ok) {
        return apiError("trade_state_conflict", {
          status: 409,
          details: { message: "Escrow hold does not match order amount/asset." },
        });
      }

      // Create a balanced journal transfer (seller -> buyer)
      const entryRows = (await tx`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'p2p_trade',
          ${`p2p_order:${order.id}`},
          ${JSON.stringify({
            order_id: order.id,
            asset_symbol: order.asset_symbol,
            amount_asset: order.amount_asset,
            fiat_currency: order.fiat_currency,
            amount_fiat: order.amount_fiat,
            resolved_by: admin.userId,
            dispute_id: disputeId,
          })}::jsonb
        )
        RETURNING id
      `) as { id: string }[];
      const entryId = entryRows[0]!.id;

      await tx`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${entryId}::uuid, ${sellerAccountId}::uuid, ${order.asset_id}::uuid, ((${order.amount_asset}::numeric) * -1)),
          (${entryId}::uuid, ${buyerAccountId}::uuid, ${order.asset_id}::uuid, (${order.amount_asset}::numeric))
      `;

      await tx`
        UPDATE ex_hold
        SET status = 'consumed', released_at = now()
        WHERE id = ${hold.id}::uuid AND status = 'active'
      `;

      await tx`
        UPDATE p2p_order
        SET status = 'completed', completed_at = now()
        WHERE id = ${order.id}::uuid
      `;

      await tx`
        INSERT INTO p2p_chat_message (order_id, sender_id, content, metadata)
        VALUES (
          ${order.id}::uuid,
          NULL,
          'System: Dispute resolved. Crypto released to buyer by support.',
          ${JSON.stringify({ type: "dispute_resolved", outcome: "release" })}::jsonb
        )
      `;

      await tx`
        UPDATE p2p_dispute
        SET status = 'resolved', resolved_by_user_id = ${admin.userId}::uuid,
            resolution_note = ${note || null}, resolution_outcome = 'release',
            resolved_at = now()
        WHERE id = ${disputeId}::uuid
      `;

      await createNotification(tx, {
        userId: order.buyer_id,
        type: "p2p_dispute_resolved",
        title: "Dispute resolved",
        body: `Support released ${order.amount_asset} ${order.asset_symbol} for order ${order.id.slice(0, 8)}.`,
        metadata: { order_id: order.id, outcome: "release" },
      });
      await createNotification(tx, {
        userId: order.seller_id,
        type: "p2p_dispute_resolved",
        title: "Dispute resolved",
        body: `Support released crypto for order ${order.id.slice(0, 8)}.`,
        metadata: { order_id: order.id, outcome: "release" },
      });

      await writeAuditLog(tx as any, {
        actorId: admin.userId,
        actorType: "admin",
        action: "p2p.dispute.resolved",
        resourceType: "p2p_order",
        resourceId: order.id,
        detail: { order_id: order.id, dispute_id: disputeId, outcome: "release", note, journal_entry_ref: `p2p_order:${order.id}` },
        ...auditCtx,
      });

      return Response.json({ ok: true, order_id: order.id, status: "completed" });
    });
  } catch (e) {
    console.error("[POST /api/p2p/admin/disputes/:id/resolve] error", e);
    if (e instanceof Response) return e;
    return apiError("internal_error");
  }
}
