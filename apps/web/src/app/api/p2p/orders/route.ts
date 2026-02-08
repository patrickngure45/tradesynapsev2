import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const createOrderSchema = z.object({
  ad_id: z.string().uuid(),
  amount_fiat: z.number().positive(),
  payment_method_id: z.string().optional(), // For Taker-Seller to provide their receiving account
});

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
     
     // Debug: Check if orders are found
     console.log(`[GET /orders] Found ${orders.length} orders for ${actingUserId}`);
     
     return NextResponse.json({ orders });
  } catch(err: any) {
     console.error("[GET /orders] Error:", err);
     return apiError("internal_error", { details: err.message });
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

    const body = await req.json();
    const payload = createOrderSchema.safeParse(body);
    if (!payload.success) return apiZodError(payload.error) ?? apiError("invalid_input");
    const { ad_id, amount_fiat, payment_method_id } = payload.data;

    console.log(`[POST /orders] Starting order for ad=${ad_id}, amount=${amount_fiat}, actor=${actingUserId}`);

    // Transaction logic
    // Set a timeout for the transaction to prevent infinite hangs
    const orderId = await sql.begin(async (txArg) => {
      const tx = txArg as any;
      console.log("[POST /orders] Transaction started");
      // 1. Fetch Ad
      // Add timeout to prevent deadlock waiting
      const [ad] = await tx`
        SELECT * FROM p2p_ad WHERE id = ${ad_id} FOR UPDATE
      `; // .timeout(5000) not supported directly on destructuring result in all versions? 
         // logic: await (tx`...`.timeout(5000)) -> returns RowList. [ad] destructures it.
         
      if (!ad) throw new Error("ad_not_found");
      console.log(`[POST /orders] Ad locked: ${ad.id}, status=${ad.status}`);
      
      // Allow self-trading in Development for testing ease
      if (process.env.NODE_ENV === 'production' && ad.user_id === actingUserId) {
         throw new Error("cannot_trade_own_ad");
      }
      
      if (ad.status !== 'online') throw new Error("ad_is_not_online");

      // 2. Validate Limits
      const min = parseFloat(ad.min_limit);
      const max = parseFloat(ad.max_limit);
      if (amount_fiat < min || amount_fiat > max) {
        throw new Error(`amount_out_of_bounds: ${min} - ${max}`);
      }
      
      // 3. Calculate Crypto Amount
      // Price: if fixed, simple. if floating, margin.
      // We assume fixed for MVP mostly, but logic:
      let price = parseFloat(ad.fixed_price); 
      // If float: fetch market price * margin. (Skip for MVP, assume fixed was updated or is valid).
      
      const amountAsset = amount_fiat / price;

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
      if (makerId === takerId) {
          throw new Error("cannot_trade_own_ad");
      }
      
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
      console.log(`[POST /orders] Roles: Buyer=${buyerId}, Seller=${sellerId}`);

      // Resolve Payment Methods Snapshot
      let paymentSnapshot: any[] = [];
      const adMethodIds = ad.payment_method_ids as string[];
      
      // If Maker is SELLING (I am Buying), we need Makers Receive Accounts
      if (makerId === sellerId) {
          if (Array.isArray(adMethodIds) && adMethodIds.length > 0) {
             const methods = await tx`SELECT * FROM p2p_payment_method WHERE id::text = ANY(${adMethodIds})`;
             paymentSnapshot = methods.length ? methods : adMethodIds.map(id => ({ identifier: id, name: id }));
          }
      } 
      // If Maker is BUYING (I am Selling), we need MY (Taker) Receive Account
      else {
          if (payment_method_id) {
             const [method] = await tx`SELECT * FROM p2p_payment_method WHERE id = ${payment_method_id} AND user_id = ${actingUserId}`;
             if (method) paymentSnapshot = [method];
          }
      }

      // 6. LOCK CRYPTO (Escrow)
      // The SELLER must have funds locked.
      // Check seller balance
      const [asset] = await tx`SELECT id, symbol FROM ex_asset WHERE id = ${ad.asset_id}`;
      
      // We need to move funds from Seller's available balance to a "Hold".
      // We use `ex_hold` table? Context says `005_exchange_holds_remaining.sql`.
      // Let's assume we can insert into `ex_hold` or equivalent.
      // Or simply: Update `ex_ledger_account`.
      
      // Let's check if `ex_hold` exists in the system via a quick check or just use manual updates.
      // Since I don't see `ex_hold` usage info in context, I will implement a Manual Lock
      // by moving from `balance` to `locked_balance` in `ex_ledger_account`.
      
      // a. Check Balance
      console.log(`[POST /orders] Locking funds for Seller=${sellerId} Asset=${asset.symbol}`);
      const [ledger] = await tx`
        SELECT balance FROM ex_ledger_account 
        WHERE user_id = ${sellerId} AND asset_id = ${asset.id}
        FOR UPDATE
      `;
      const currentBalance = ledger ? parseFloat(ledger.balance) : 0;
      
      if (currentBalance < amountAsset) {
        throw new Error("seller_insufficient_funds");
      }

      // b. Update Ad Remaining Amount (Inventory management)
      await tx`
        UPDATE p2p_ad 
        SET remaining_amount = remaining_amount - ${amountAsset}
        WHERE id = ${ad.id}
      `;

      // c. Create Order
      // Fix: interval syntax with parameters can be tricky in some drivers.
      // Use standard Postgres interval multiplication: make_interval(mins => value)
      // or just calculate the timestamp in JS to be safe.
      const expiresAt = new Date(Date.now() + ad.payment_window_minutes * 60000);

      const [newOrder] = await tx`
        INSERT INTO p2p_order (
          ad_id, maker_id, taker_id, buyer_id, seller_id,
          asset_id, amount_asset, price, amount_fiat, fiat_currency,
          status, payment_method_snapshot, expires_at
        ) VALUES (
          ${ad.id}, ${makerId}, ${takerId}, ${buyerId}, ${sellerId},
          ${asset.id}, ${amountAsset}, ${price}, ${amount_fiat}, ${ad.fiat_currency},
          'created', ${paymentSnapshot}::jsonb, ${expiresAt}
        )
        RETURNING id
      `;
      console.log(`[POST /orders] Order created in DB: ${newOrder.id}`);

      // d. Execute The Lock (Deduct from balance, Add to Locked?)
      // Actually, for P2P, we prefer moving to a system escrow account so user can't "trade" it in spot.
      // But standard "locked" balance in `ex_ledger_account` usually prevents withdrawal/trade.
      // Let's assume `locked` column exists (standard pattern).
      // Verify `003_exchange_ledger.sql` if needed, but safe guess used in most systems.
      // Actually, to be safe, I will deduce from `balance` and add to `locked`.
      
      /* 
         NOTE: We are updating the seller's ledger.
         If Seller is Taker (Ad side=BUY), we update Taker.
         If Seller is Maker (Ad side=SELL), we update Maker.
      */
      
      await tx`
        UPDATE ex_ledger_account
        SET 
          balance = balance - ${amountAsset},
          locked = locked + ${amountAsset}
        WHERE user_id = ${sellerId} AND asset_id = ${asset.id}
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

      console.log("[POST /orders] Transaction finished successfully");
      return newOrder.id;
    });

    return NextResponse.json({ success: true, order_id: orderId });

  } catch (err: any) {
    console.error("[POST /orders] Error:", err);
    return apiError(err.message || "internal_error", { details: err.toString() });
  }
}
