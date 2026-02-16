import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

function requireCronAuth(req: NextRequest): string | null {
	// In production, require a shared secret.
	// In dev, allow unauthenticated calls for local testing.
	if (process.env.NODE_ENV !== "production") return null;

	const configured = process.env.P2P_CRON_SECRET ?? process.env.CRON_SECRET;
	if (!configured) return "cron_secret_not_configured";

	const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
	if (!provided || provided !== configured) return "cron_unauthorized";
	return null;
}

type ExpiredOrder = {
	id: string;
	ad_id: string;
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
		const status = authErr === "cron_unauthorized" ? 401 : 500;
		return NextResponse.json({ error: authErr }, { status });
	}

	const sql = getSql();
	const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? "50")));

	try {
		const result = await sql.begin(async (tx: any) => {
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

			return { expiredCount: expired.length, expiredIds: expired.map((o) => o.id) };
		});

		return NextResponse.json({ ok: true, ...result });
	} catch (err) {
		console.error("P2P expire-orders cron failed:", err);
		return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
	}
}

