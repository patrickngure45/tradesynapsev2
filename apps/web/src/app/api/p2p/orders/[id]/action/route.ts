import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { getSql } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { hasUsablePaymentDetails, normalizePaymentMethodSnapshot } from "@/lib/p2p/paymentSnapshot";
import { canPerformP2POrderAction } from "@/lib/p2p/orderStateMachine";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";

const actionSchema = z.object({
  action: z.enum(["PAY_CONFIRMED", "RELEASE", "CANCEL"]),
});

let p2pOrderActionLimiter: PgRateLimiter | null = null;
function getP2POrderActionLimiter(): PgRateLimiter {
  if (p2pOrderActionLimiter) return p2pOrderActionLimiter;
  const sql = getSql();
  p2pOrderActionLimiter = createPgRateLimiter(sql, {
    name: "p2p-order-action",
    windowMs: 60_000,
    max: 30,
  });
  return p2pOrderActionLimiter;
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const userId = getActingUserId(req);
    const authErr = requireActingUserIdInProd(userId);
    if (authErr) return apiError(authErr);
    if (!userId) return apiError("unauthorized", { status: 401 });

    const sql = getSql();
    const activeErr = await requireActiveUser(sql, userId);
    if (activeErr) return apiError(activeErr);

    const rl = await getP2POrderActionLimiter().consume(`user:${userId}`);
    if (!rl.allowed) {
      return apiError("rate_limit_exceeded", {
        status: 429,
        details: { limit: rl.limit, remaining: rl.remaining, resetMs: rl.resetMs },
      });
    }

    const orderId = params.id;
    const body = await req.json().catch(() => null);
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalid_input", { status: 400, details: parsed.error.issues });
    }
    const { action } = parsed.data;
    const auditCtx = auditContextFromRequest(req);

    type SideEffect =
      | {
          kind: "audit";
          entry: Parameters<typeof writeAuditLog>[1];
        }
      | {
          kind: "notify";
          params: Parameters<typeof createNotification>[1];
        };

    const txResult = await sql.begin(async (tx: any) => {
      const [order] = await tx`
        SELECT o.*, a.symbol AS asset_symbol
        FROM p2p_order o
        JOIN ex_asset a ON a.id = o.asset_id
        WHERE o.id = ${orderId}
          AND (o.buyer_id = ${userId} OR o.seller_id = ${userId})
        FOR UPDATE
      `;

      // Return 404 for both not-found and access denied (prevents existence leaks).
      if (!order) return apiError("order_not_found", { status: 404 });

      const isBuyer = order.buyer_id === userId;
      const isSeller = order.seller_id === userId;

      const guard = canPerformP2POrderAction({
        status: order.status,
        action,
        actorRole: isBuyer ? "buyer" : "seller",
        nowMs: Date.now(),
        expiresAtMs: order.expires_at ? new Date(order.expires_at).getTime() : null,
      });
      if (!guard.ok) {
        return { response: apiError(guard.code, {
          status: guard.httpStatus,
          details: guard.message ? { message: guard.message } : undefined,
        }) };
      }

      const effects: SideEffect[] = [];

      // ── PAY_CONFIRMED ─────────────────────────────────────────────
      if (action === "PAY_CONFIRMED") {
        if (!isBuyer) return apiError("actor_not_allowed", { status: 403 });

        const snapshot = normalizePaymentMethodSnapshot(order.payment_method_snapshot);
        if (!hasUsablePaymentDetails(snapshot)) {
          return apiError("order_state_conflict", {
            status: 409,
            details: { message: "Payment details are not ready for this order." },
          });
        }

        const updated = await tx`
          UPDATE p2p_order
          SET status = 'paid_confirmed', paid_at = now()
          WHERE id = ${orderId} AND status = 'created'
          RETURNING *
        `;
        const updatedOrder = updated[0];
        if (!updatedOrder) return apiError("order_state_conflict", { status: 409 });

        await tx`
          INSERT INTO p2p_chat_message (order_id, sender_id, content)
          VALUES (${orderId}, NULL, 'Buyer has marked as paid. Seller please verify.')
        `;

        effects.push({
          kind: "audit",
          entry: {
            actorId: userId,
            actorType: "user",
            action: "p2p.order.paid_confirmed",
            resourceType: "p2p_order",
            resourceId: orderId,
            detail: { order_id: orderId },
            ...auditCtx,
          },
        });

        effects.push({
          kind: "notify",
          params: {
            userId: order.seller_id,
            type: "p2p_payment_confirmed",
            title: "Payment Marked as Sent",
            body: `Buyer marked order ${orderId.slice(0, 8)} as paid. Please check your bank.`,
            metadata: { order_id: orderId },
          },
        });

        effects.push({
          kind: "notify",
          params: {
            userId: order.buyer_id,
            type: "p2p_payment_confirmed",
            title: "Marked as Paid",
            body: `You marked order ${orderId.slice(0, 8)} as paid. Waiting for seller verification and release.`,
            metadata: { order_id: orderId },
          },
        });

        return { order: updatedOrder, effects };
      }

      // ── RELEASE ───────────────────────────────────────────────────
      if (action === "RELEASE") {
        if (!isSeller) return apiError("actor_not_allowed", { status: 403 });
        if (!order.escrow_hold_id) {
          return { response: apiError("order_state_conflict", {
            status: 409,
            details: { message: "Escrow hold not found for this order." },
          }) };
        }

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
          return { response: apiError("order_state_conflict", {
            status: 409,
            details: { message: "Escrow hold is missing." },
          }) };
        }

        // If the hold is already consumed, a previous release attempt likely succeeded
        // but crashed before updating the order row. Finish the order idempotently.
        if (hold.status === "consumed") {
          const updated = await tx`
            UPDATE p2p_order
            SET status = 'completed', completed_at = now()
            WHERE id = ${orderId} AND status = 'paid_confirmed'
            RETURNING *
          `;
          const updatedOrder = updated[0];
          if (!updatedOrder) return { response: apiError("order_state_conflict", { status: 409 }) };

          await tx`
            INSERT INTO p2p_chat_message (order_id, sender_id, content)
            VALUES (${orderId}, NULL, 'System: Crypto released to buyer. Order completed.')
          `;

          effects.push({
            kind: "audit",
            entry: {
              actorId: userId,
              actorType: "user",
              action: "p2p.order.released",
              resourceType: "p2p_order",
              resourceId: orderId,
              detail: { order_id: orderId, journal_entry_ref: `p2p_order:${orderId}`, idempotent_recover: true },
              ...auditCtx,
            },
          });

          effects.push({
            kind: "notify",
            params: {
              userId: order.buyer_id,
              type: "p2p_order_completed",
              title: "Order Completed",
              body: `Seller released ${order.amount_asset} ${order.asset_symbol} to your wallet.`,
              metadata: { order_id: orderId },
            },
          });

          effects.push({
            kind: "notify",
            params: {
              userId: order.seller_id,
              type: "p2p_order_completed",
              title: "Order Completed",
              body: `You released ${order.amount_asset} ${order.asset_symbol}. Order ${orderId.slice(0, 8)} is complete.`,
              metadata: { order_id: orderId },
            },
          });

          return { order: updatedOrder, effects };
        }

        if (hold.status !== "active") {
          return { response: apiError("order_state_conflict", {
            status: 409,
            details: { message: "Escrow hold is not active." },
          }) };
        }

        if (hold.account_id !== String(sellerAccountId)) {
          return { response: apiError("order_state_conflict", {
            status: 409,
            details: { message: "Escrow hold account mismatch." },
          }) };
        }

        const invariantRows = (await tx`
          SELECT (
            (${hold.asset_id}::uuid = ${order.asset_id}::uuid)
            AND (${hold.amount}::numeric = ${order.amount_asset}::numeric)
          ) AS ok
        `) as { ok: boolean }[];
        if (!invariantRows[0]?.ok) {
          return { response: apiError("order_state_conflict", {
            status: 409,
            details: { message: "Escrow hold does not match order amount/asset." },
          }) };
        }

        // Idempotency: if a previous attempt already created a journal entry,
        // do not create another transfer.
        const existingEntries = (await tx`
          SELECT id::text
          FROM ex_journal_entry
          WHERE type = 'p2p_trade' AND reference = ${`p2p_order:${orderId}`}
          ORDER BY created_at DESC
          LIMIT 1
        `) as { id: string }[];

        if (existingEntries.length === 0) {
          const entryRows = (await tx`
            INSERT INTO ex_journal_entry (type, reference, metadata_json)
            VALUES (
              'p2p_trade',
              ${`p2p_order:${orderId}`},
              ${tx.json({
                order_id: orderId,
                asset_symbol: order.asset_symbol,
                amount_asset: order.amount_asset,
                fiat_currency: order.fiat_currency,
                amount_fiat: order.amount_fiat,
              } as any)}::jsonb
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
        }

        // Consume escrow hold (idempotent)
        await tx`
          UPDATE ex_hold
          SET status = 'consumed', released_at = now()
          WHERE id = ${hold.id}::uuid AND status = 'active'
        `;

        const updated = await tx`
          UPDATE p2p_order
          SET status = 'completed', completed_at = now()
          WHERE id = ${orderId} AND status = 'paid_confirmed'
          RETURNING *
        `;
        const updatedOrder = updated[0];
        if (!updatedOrder) return { response: apiError("order_state_conflict", { status: 409 }) };

        await tx`
          INSERT INTO p2p_chat_message (order_id, sender_id, content)
          VALUES (${orderId}, NULL, 'System: Crypto released to buyer. Order completed.')
        `;

        effects.push({
          kind: "audit",
          entry: {
            actorId: userId,
            actorType: "user",
            action: "p2p.order.released",
            resourceType: "p2p_order",
            resourceId: orderId,
            detail: { order_id: orderId, journal_entry_ref: `p2p_order:${orderId}` },
            ...auditCtx,
          },
        });

        effects.push({
          kind: "notify",
          params: {
            userId: order.buyer_id,
            type: "p2p_order_completed",
            title: "Order Completed",
            body: `Seller released ${order.amount_asset} ${order.asset_symbol} to your wallet.`,
            metadata: { order_id: orderId },
          },
        });

        effects.push({
          kind: "notify",
          params: {
            userId: order.seller_id,
            type: "p2p_order_completed",
            title: "Order Completed",
            body: `You released ${order.amount_asset} ${order.asset_symbol}. Order ${orderId.slice(0, 8)} is complete.`,
            metadata: { order_id: orderId },
          },
        });

        return { order: updatedOrder, effects };
      }

      // ── CANCEL ────────────────────────────────────────────────────
      if (action === "CANCEL") {
        // role + timing rules are enforced by the shared guard; keep local role var
        // only for system message / audit metadata.

        if (order.escrow_hold_id) {
          await tx`
            UPDATE ex_hold
            SET status = 'released', released_at = now()
            WHERE id = ${order.escrow_hold_id}::uuid AND status = 'active'
          `;
        }

        await tx`
          UPDATE p2p_ad
          SET remaining_amount = remaining_amount + ${order.amount_asset}
          WHERE id = ${order.ad_id}
        `;

        const updated = await tx`
          UPDATE p2p_order
          SET status = 'cancelled', cancelled_at = now()
          WHERE id = ${orderId} AND status = 'created'
          RETURNING *
        `;
        const updatedOrder = updated[0];
        if (!updatedOrder) return { response: apiError("order_state_conflict", { status: 409 }) };

        await tx`
          INSERT INTO p2p_chat_message (order_id, sender_id, content)
          VALUES (
            ${orderId},
            NULL,
            ${isBuyer ? "System: Order cancelled by buyer." : "System: Order cancelled due to timeout."}
          )
        `;

        effects.push({
          kind: "audit",
          entry: {
            actorId: userId,
            actorType: "user",
            action: "p2p.order.cancelled",
            resourceType: "p2p_order",
            resourceId: orderId,
            detail: { order_id: orderId, by: isBuyer ? "buyer" : "seller_timeout" },
            ...auditCtx,
          },
        });

        effects.push({
          kind: "notify",
          params: {
            userId: order.seller_id,
            type: "p2p_order_cancelled",
            title: "Order Cancelled",
            body: `Order ${orderId.slice(0, 8)} was cancelled. Funds returned to your available balance.`,
            metadata: { order_id: orderId },
          },
        });

        effects.push({
          kind: "notify",
          params: {
            userId: order.buyer_id,
            type: "p2p_order_cancelled",
            title: "Order Cancelled",
            body: `Order ${orderId.slice(0, 8)} was cancelled. If you sent funds, contact support and the counterparty immediately.`,
            metadata: { order_id: orderId },
          },
        });

        return { order: updatedOrder, effects };
      }

      return { response: apiError("invalid_input", { status: 400 }) };
    });

    if (txResult && typeof txResult === "object" && "response" in txResult) {
      return (txResult as any).response as Response;
    }

    const resultOrder = (txResult as any).order;
    const effects = ((txResult as any).effects ?? []) as SideEffect[];

    // Best-effort side effects after commit: do not fail the request.
    // (Notifications/audit should never block asset release.)
    for (const eff of effects) {
      try {
        if (eff.kind === "audit") await writeAuditLog(sql as any, eff.entry as any);
        else await createNotification(sql as any, eff.params as any);
      } catch (e) {
        console.error("[p2p order action] side effect failed", eff.kind, e);
      }
    }

    return NextResponse.json(resultOrder);
  } catch (error) {
    console.error("Error performing order action:", error);
    if (error instanceof Response) return error;

    // In development, include minimal debug info to speed up iteration.
    if (process.env.NODE_ENV !== "production") {
      const msg = typeof (error as any)?.message === "string" ? (error as any).message : String(error);
      const pgCode = typeof (error as any)?.code === "string" ? (error as any).code : undefined;
      return apiError("internal_error", {
        status: 500,
        details: {
          message: msg,
          ...(pgCode ? { pgCode } : {}),
        },
      });
    }

    return apiError("internal_error");
  }
}
