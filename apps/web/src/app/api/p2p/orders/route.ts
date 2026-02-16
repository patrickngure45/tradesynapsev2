import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { createNotification } from "@/lib/notifications";
import { hasUsablePaymentDetails, normalizePaymentMethodSnapshot } from "@/lib/p2p/paymentSnapshot";
import { getOrComputeFxReferenceRate } from "@/lib/fx/reference";
import { isSupportedP2PCountry } from "@/lib/p2p/supportedCountries";

export const dynamic = "force-dynamic";

const createOrderSchema = z.object({
  ad_id: z.string().uuid(),
  amount_fiat: z.number().positive(),
  payment_method_id: z.string().uuid().optional(), // For Taker-Seller to provide their receiving account
});

function getBandPctForFiat(fiat: string): number {
  const f = fiat.toUpperCase();
  const specific = process.env[`P2P_PRICE_BAND_PCT_${f}`];
  const raw = specific ?? process.env.P2P_PRICE_BAND_PCT ?? "0.02";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0.02;
  return Math.min(0.25, Math.max(0.001, n));
}

export async function GET(req: NextRequest) {
  const sql = getSql();
  const actingUserId = getActingUserId(req);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
     // Fetch Orders where I am involved
     const orders = await sql`
        SELECT 
           o.id, 
           o.status, 
           o.amount_fiat, 
           o.fiat_currency, 
           o.amount_asset,
           o.price, 
           o.created_at,
          o.payment_method_snapshot,
           a.symbol as asset_symbol,
           CASE WHEN o.buyer_id = ${actingUserId} THEN 'BUY' ELSE 'SELL' END as my_side
        FROM p2p_order o
        LEFT JOIN ex_asset a ON a.id = o.asset_id
        WHERE o.maker_id = ${actingUserId} 
           OR o.taker_id = ${actingUserId} 
           OR o.buyer_id = ${actingUserId} 
           OR o.seller_id = ${actingUserId}
        ORDER BY o.created_at DESC
        LIMIT 50
     `;
     
     const hydratedOrders = orders.map((order: any) => {
       const { payment_method_snapshot, ...rest } = order;
       return {
       ...rest,
       payment_details_ready: hasUsablePaymentDetails(
         normalizePaymentMethodSnapshot(payment_method_snapshot)
       ),
     };
    });

     return NextResponse.json({ orders: hydratedOrders });
  } catch(err: any) {
     console.error("[GET /orders] Error:", err);
     return apiError("internal_error");
  }
}

export async function POST(req: NextRequest) {
  const sql = getSql();
  const actingUserId = getActingUserId(req);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const userRows = await sql<{ country: string | null }[]>`
      SELECT country
      FROM app_user
      WHERE id = ${actingUserId}::uuid
      LIMIT 1
    `;
    const country = userRows[0]?.country ?? null;
    if (!isSupportedP2PCountry(country)) {
      return apiError("p2p_country_not_supported", {
        status: 403,
        details: { country },
      });
    }

    const body = await req.json();
    const payload = createOrderSchema.safeParse(body);
    if (!payload.success) return apiZodError(payload.error) ?? apiError("invalid_input");
    const { ad_id, amount_fiat, payment_method_id } = payload.data;

    const orderId = await sql.begin(async (txArg) => {
      const tx = txArg as any;

      // 1. Fetch & lock the ad
      const [ad] = await tx`
        SELECT * FROM p2p_ad WHERE id = ${ad_id} FOR UPDATE
      `;
         
      if (!ad) throw new Error("ad_not_found");
      
      if (ad.user_id === actingUserId) {
         throw new Error("cannot_trade_own_ad");
      }
      
      if (ad.status !== 'online') throw new Error("ad_is_not_online");

      // 2. Validate Limits
      const min = parseFloat(ad.min_limit);
      const max = parseFloat(ad.max_limit);
      if (amount_fiat < min || amount_fiat > max) {
        throw new Error("amount_out_of_bounds");
      }
      
      // 3. Calculate Crypto Amount
      let price = parseFloat(ad.fixed_price);
      const amountAsset = amount_fiat / price;

      // 3b. Guardrail: for fixed-price ads, ensure price is within reference band when available.
      // Prevents stale/crazy-priced ads from being used to scam takers.
      let refMid: number | null = null;
      let refSources: Record<string, unknown> | null = null;
      let refComputedAt: Date | null = null;
      const fiat = String(ad.fiat_currency ?? "").toUpperCase();

      // Fetch asset symbol (needed for guardrails and later ledger ops)
      const [asset] = await tx`SELECT id, symbol FROM ex_asset WHERE id = ${ad.asset_id}`;

      if (asset?.symbol && ad.price_type === "fixed") {
        const ref = await getOrComputeFxReferenceRate(tx as any, asset.symbol, fiat);
        if (ref) {
          refMid = ref.mid;
          refSources = ref.sources;
          refComputedAt = ref.computedAt;
          const bandPct = getBandPctForFiat(fiat);
          const lo = refMid * (1 - bandPct);
          const hi = refMid * (1 + bandPct);
          if (price < lo || price > hi) {
            throw new Error("p2p_price_out_of_band");
          }
        }
      }

      // 4. Validate Remaining Amount in Ad
      const remaining = parseFloat(ad.remaining_amount);
      if (amountAsset > remaining) {
        // Rounding issues possible, but strict check for now
        throw new Error("insufficient_liquidity_on_ad");
      }

      // 5. Determine Roles
      // Ad Side: BUY (Maker wants to BUY crypto) -> Taker must SELL crypto.
      // Ad Side: SELL (Maker wants to SELL crypto) -> Taker must BUY crypto.
      const makerId = ad.user_id;
      
      let takerId = actingUserId;
      
      let sellerId, buyerId;
      if (ad.side === 'BUY') {
        // Maker is Buying, Taker is Selling
        buyerId = makerId;
        sellerId = takerId;
      } else {
        // Maker is Selling, Taker is Buying
        buyerId = takerId;
        sellerId = makerId;
      }

      // Resolve Payment Methods Snapshot (must always be seller payout details)
      let paymentSnapshot: Array<{
        id?: string;
        identifier: string;
        name: string;
        details: Record<string, unknown> | null;
      }> = [];
      const adMethodIds = Array.isArray(ad.payment_method_ids) ? (ad.payment_method_ids as string[]) : [];

      // If maker is seller, buyer should receive seller's ad payment methods.
      if (makerId === sellerId) {
        if (adMethodIds.length === 0) {
          throw new Error("seller_payment_details_missing");
        }

        const methods = await tx`
          SELECT id, identifier, name, details
          FROM p2p_payment_method
          WHERE id::text = ANY(${adMethodIds})
            AND user_id = ${sellerId}
        `;

        if (!methods.length) {
          throw new Error("seller_payment_details_missing");
        }

        paymentSnapshot = normalizePaymentMethodSnapshot(methods);

        if (!hasUsablePaymentDetails(paymentSnapshot)) {
          throw new Error("seller_payment_details_missing");
        }
      } else {
        // If maker is buyer, taker (seller) must explicitly provide receiving method.
        if (!payment_method_id) {
          throw new Error("seller_payment_method_required");
        }

        const [method] = await tx`
          SELECT id, identifier, name, details
          FROM p2p_payment_method
          WHERE id = ${payment_method_id}
            AND user_id = ${sellerId}
        `;

        if (!method) {
          throw new Error("invalid_seller_payment_method");
        }

        paymentSnapshot = normalizePaymentMethodSnapshot([method]);

        if (!hasUsablePaymentDetails(paymentSnapshot)) {
          throw new Error("seller_payment_details_missing");
        }
      }

      // 6. LOCK CRYPTO (Escrow) — create an ex_hold on seller's ledger account.
      // This is the authoritative lock used across the system (withdrawals, etc.).

      const sellerAccountRows = (await tx`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${sellerId}::uuid, ${asset.id}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `) as { id: string }[];
      const sellerAccountId = sellerAccountRows[0]!.id;

      const availRows = (await tx`
        WITH posted AS (
          SELECT coalesce(sum(amount), 0)::numeric AS posted
          FROM ex_journal_line
          WHERE account_id = ${sellerAccountId}::uuid
        ),
        held AS (
          SELECT coalesce(sum(amount), 0)::numeric AS held
          FROM ex_hold
          WHERE account_id = ${sellerAccountId}::uuid AND status = 'active'
        )
        SELECT
          posted.posted::text AS posted,
          held.held::text AS held,
          (posted.posted - held.held)::text AS available,
          ((posted.posted - held.held) >= (${amountAsset}::numeric)) AS ok
        FROM posted, held
      `) as { posted: string; held: string; available: string; ok: boolean }[];

      if (!availRows[0]?.ok) {
        throw new Error("seller_insufficient_funds");
      }

      // b. Update Ad Remaining Amount (Inventory management)
      await tx`
        UPDATE p2p_ad 
        SET remaining_amount = remaining_amount - ${amountAsset}
        WHERE id = ${ad.id}
      `;

      // c. Create Order
      const expiresAt = new Date(Date.now() + ad.payment_window_minutes * 60000);

      const [newOrder] = await tx`
        INSERT INTO p2p_order (
          ad_id, maker_id, taker_id, buyer_id, seller_id,
          asset_id, amount_asset, price, amount_fiat, fiat_currency,
          status, payment_method_snapshot, expires_at,
          reference_mid, reference_sources, reference_computed_at, price_band_pct
        ) VALUES (
          ${ad.id}, ${makerId}, ${takerId}, ${buyerId}, ${sellerId},
          ${asset.id}, ${amountAsset}, ${price}, ${amount_fiat}, ${ad.fiat_currency},
          'created', ${paymentSnapshot}::jsonb, ${expiresAt},
          ${refMid}, ${refSources ? JSON.stringify(refSources) : "{}"}::jsonb, ${refComputedAt ? refComputedAt.toISOString() : null},
          ${refMid ? getBandPctForFiat(ad.fiat_currency) : null}
        )
        RETURNING id
      `;

      // d. Create ex_hold as escrow and link it to the order
      const holdRows = (await tx`
        INSERT INTO ex_hold (account_id, asset_id, amount, reason, status)
        VALUES (
          ${sellerAccountId}::uuid,
          ${asset.id}::uuid,
          (${amountAsset}::numeric),
          ${`p2p_order:${newOrder.id}`},
          'active'
        )
        RETURNING id
      `) as { id: string }[];

      await tx`
        UPDATE p2p_order
        SET escrow_hold_id = ${holdRows[0]!.id}::uuid
        WHERE id = ${newOrder.id}
      `;
      
      // e. Init Chat
      await tx`
        INSERT INTO p2p_chat_message (order_id, sender_id, content)
        VALUES 
        (${newOrder.id}, NULL, 'Order created. Escrow secured. Please proceed with payment.')
      `;
      if (ad.auto_reply) {
         await tx`
          INSERT INTO p2p_chat_message (order_id, sender_id, content)
          VALUES 
          (${newOrder.id}, ${makerId}, ${ad.auto_reply})
        `;
      }

      // f. Notify Maker
      await createNotification(tx, {
        userId: makerId,
        type: "p2p_order_created", 
        title: "New P2P Order",
        body: ` Someone started a trade on your ad for ${amount_fiat} ${ad.fiat_currency}.`,
        metadata: { order_id: newOrder.id }
      });

      return newOrder.id;
    });

    return NextResponse.json({ success: true, order_id: orderId });

  } catch (err: any) {
    console.error("[POST /orders] Error:", err);
    // Map known domain errors to user-safe codes; hide internals
    const knownErrors = [
      "ad_not_found", "cannot_trade_own_ad", "ad_is_not_online",
      "amount_out_of_bounds", "insufficient_liquidity_on_ad", "seller_insufficient_funds",
      "seller_payment_details_missing", "seller_payment_method_required", "invalid_seller_payment_method",
      "reference_price_unavailable", "p2p_price_out_of_band",
    ];
    const code = knownErrors.find(e => err.message?.startsWith(e)) ?? "internal_error";
    return apiError(code);
  }
}
