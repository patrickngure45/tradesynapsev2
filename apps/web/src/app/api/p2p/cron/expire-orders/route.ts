import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { requireCronRequestAuth } from "@/lib/auth/cronAuth";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireCronAuth(req: NextRequest): string | null {
	return requireCronRequestAuth(req, {
		secretEnvKeys: ["P2P_CRON_SECRET", "EXCHANGE_CRON_SECRET", "CRON_SECRET"],
		allowlistEnvKeys: ["P2P_CRON_ALLOWED_IPS", "EXCHANGE_CRON_ALLOWED_IPS", "CRON_ALLOWED_IPS"],
	});
}

type ExpiredOrder = {
	id: string;
	ad_id: string;
	ad_side: string;
	ad_inventory_hold_id: string | null;
	escrow_hold_id: string | null;
	amount_asset: string;
	seller_id: string;
	buyer_id: string;
	fiat_currency: string;
	amount_fiat: string;
};

export async function POST(req: NextRequest) {
	const authErr = requireCronAuth(req);
	if (authErr) {
		const sql = getSql();
		await upsertServiceHeartbeat(sql as any, {
			service: "p2p:expire-orders",
			status: "error",
			details: { error: authErr },
		}).catch(() => void 0);
		const status = authErr === "cron_unauthorized" ? 401 : 500;
		return NextResponse.json({ error: authErr }, { status });
	}

	const sql = getSql();
	const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? "50")));
	const warnMinutes = Math.max(1, Math.min(60, Number(process.env.P2P_EXPIRY_WARNING_MINUTES ?? "5") || 5));

	try {
		const result = await sql.begin(async (tx: any) => {
			// 0. Warn about orders that are close to expiring (one-time reminder)
			// We lock candidate rows to avoid duplicate reminders across concurrent cron runs.
			const expiringSoon = (await tx`
				WITH candidates AS (
					SELECT id
					FROM p2p_order
					WHERE status = 'created'
						AND expires_at > now()
						AND expires_at <= now() + make_interval(mins => ${warnMinutes})
					ORDER BY expires_at ASC
					LIMIT ${limit}
					FOR UPDATE SKIP LOCKED
				)
				SELECT
					o.id::text,
					o.buyer_id::text,
					o.seller_id::text,
					o.expires_at,
					o.fiat_currency,
					o.amount_fiat::text
				FROM p2p_order o
				JOIN candidates c ON c.id = o.id
				WHERE NOT EXISTS (
					SELECT 1
					FROM ex_notification n
					WHERE n.user_id = o.buyer_id
						AND n.type = 'p2p_order_expiring'
						AND (n.metadata_json->>'order_id') = (o.id::text)
				)
			`) as {
				id: string;
				buyer_id: string;
				seller_id: string;
				expires_at: Date;
				fiat_currency: string;
				amount_fiat: string;
			}[];

			for (const order of expiringSoon) {
				await createNotification(tx, {
					userId: order.buyer_id,
					type: "p2p_order_expiring",
					title: "Payment window ending soon",
					body: `Order ${order.id.slice(0, 8)} expires soon. Mark as paid only after you actually sent ${order.amount_fiat} ${order.fiat_currency}.`,
					metadata: {
						order_id: order.id,
						expires_at: order.expires_at?.toISOString?.() ?? String(order.expires_at),
						warn_minutes: warnMinutes,
					},
				});
			}

			// Lock and cancel a batch of expired orders.
			// We only auto-expire orders that are still awaiting payment confirmation.
			const expired = (await tx`
				WITH candidates AS (
					SELECT id
					FROM p2p_order
					WHERE status = 'created'
						AND expires_at <= now()
					ORDER BY expires_at ASC
					LIMIT ${limit}
					FOR UPDATE SKIP LOCKED
				)
				UPDATE p2p_order o
				SET status = 'cancelled', cancelled_at = now()
				FROM candidates c
				WHERE o.id = c.id
				RETURNING
					o.id::text,
					o.ad_id::text,
					(SELECT ad.side FROM p2p_ad ad WHERE ad.id = o.ad_id) AS ad_side,
					(SELECT ad.inventory_hold_id::text FROM p2p_ad ad WHERE ad.id = o.ad_id) AS ad_inventory_hold_id,
					o.escrow_hold_id::text,
					o.amount_asset::text,
					o.seller_id::text,
					o.buyer_id::text,
					o.fiat_currency,
					o.amount_fiat::text
			`) as ExpiredOrder[];

			for (const order of expired) {
				// Release escrow hold (if still active)
				if (order.escrow_hold_id) {
					await tx`
						UPDATE ex_hold
						SET status = 'released', released_at = now()
						WHERE id = ${order.escrow_hold_id}::uuid
							AND status = 'active'
					`;
				}

				// Restore ad liquidity
				await tx`
					UPDATE p2p_ad
					SET remaining_amount = remaining_amount + (${order.amount_asset}::numeric)
					WHERE id = ${order.ad_id}::uuid
				`;

				// Restore inventory hold for funded SELL ads
				if (order.ad_side === "SELL" && order.ad_inventory_hold_id) {
					await tx`
						UPDATE ex_hold
						SET
							remaining_amount = remaining_amount + (${order.amount_asset}::numeric)
						WHERE id = ${order.ad_inventory_hold_id}::uuid
							AND status = 'active'
					`;
				}

				// System chat message
				await tx`
					INSERT INTO p2p_chat_message (order_id, sender_id, content)
					VALUES (${order.id}::uuid, NULL, 'System: Order expired due to payment timeout. Escrow released.')
				`;

				// Notify both parties
				await createNotification(tx, {
					userId: order.buyer_id,
					type: "p2p_order_cancelled",
					title: "P2P Order Expired",
					body: `Order ${order.id.slice(0, 8)} expired. Funds were released back to the seller.`,
					metadata: { order_id: order.id, reason: "expired" },
				});

				await createNotification(tx, {
					userId: order.seller_id,
					type: "p2p_order_cancelled",
					title: "P2P Order Expired",
					body: `Order ${order.id.slice(0, 8)} expired. Your escrow was released back to your available balance.`,
					metadata: { order_id: order.id, reason: "expired" },
				});
			}

			return {
				expiringSoonCount: expiringSoon.length,
				expiringSoonIds: expiringSoon.map((o) => o.id),
				expiredCount: expired.length,
				expiredIds: expired.map((o) => o.id),
			};
		});

		await upsertServiceHeartbeat(sql as any, {
			service: "p2p:expire-orders",
			status: "ok",
			details: {
				expiring_soon_count: result.expiringSoonCount,
				expired_count: result.expiredCount,
				limit,
			},
		}).catch(() => void 0);

		return NextResponse.json({ ok: true, ...result });
	} catch (err) {
		console.error("P2P expire-orders cron failed:", err);
		await upsertServiceHeartbeat(sql as any, {
			service: "p2p:expire-orders",
			status: "error",
			details: { error: err instanceof Error ? err.message : String(err), limit },
		}).catch(() => void 0);
		return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
	}
}

// Allow simple cron providers that only support GET.
export async function GET(req: NextRequest) {
	return POST(req);
}

