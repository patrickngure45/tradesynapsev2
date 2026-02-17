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
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let p2pOrderCreateLimiter: PgRateLimiter | null = null;
function getP2POrderCreateLimiter(): PgRateLimiter {
  if (p2pOrderCreateLimiter) return p2pOrderCreateLimiter;
  const sql = getSql();
  p2pOrderCreateLimiter = createPgRateLimiter(sql, {
    name: "p2p-order-create",
    windowMs: 60_000,
    max: 6,
  });
  return p2pOrderCreateLimiter;
}

function getClientIp(req: NextRequest): string | null {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

function parseJsonbTextArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);

  // Some JSONB columns have legacy string-encoded JSON arrays.
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);

      // Legacy: jsonb string that itself contains a JSON array, e.g. "[\"uuid\"]".
      if (typeof parsed === "string") {
        const nested = parsed.trim();
        if (nested.startsWith("[") && nested.endsWith("]")) {
          const parsed2 = JSON.parse(nested);
          if (Array.isArray(parsed2)) return parsed2.map((x) => String(x)).filter(Boolean);
        }
      }
    } catch {
      // ignore
    }
  }

  return [];
}

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

    // ── Abuse prevention: rate limit order creation (per-user + per-IP) ──
    // Keeps the marketplace usable under spam/automation.
    const limiter = getP2POrderCreateLimiter();
    const ip = getClientIp(req);
    const [rlUser, rlIp] = await Promise.all([
      limiter.consume(`user:${actingUserId}`),
      ip ? limiter.consume(`ip:${ip}`) : Promise.resolve(null),
    ]);
    const rl = !rlUser.allowed ? rlUser : rlIp && !rlIp.allowed ? rlIp : null;
    if (rl && !rl.allowed) {
      return apiError("rate_limit_exceeded", {
        status: 429,
        details: { limit: rl.limit, remaining: rl.remaining, resetMs: rl.resetMs },
      });
    }

    const body = await req.json().catch(() => null);
    const payload = createOrderSchema.safeParse(body);
    if (!payload.success) return apiZodError(payload.error) ?? apiError("invalid_input");
    const { ad_id, amount_fiat, payment_method_id } = payload.data;

    // ── Abuse prevention: open-order cap + cooldown for repeat timeouts ──
    // 1) Cap how many "awaiting payment" orders a buyer can keep open.
    const maxOpenCreated = Number(process.env.P2P_MAX_OPEN_CREATED_ORDERS ?? "3");
    if (Number.isFinite(maxOpenCreated) && maxOpenCreated > 0) {
      const rows = await sql<{ open_created: number }[]>`
        SELECT count(*)::int AS open_created
        FROM p2p_order
        WHERE buyer_id = ${actingUserId}::uuid
          AND status = 'created'
          AND (expires_at IS NULL OR expires_at > now())
      `;
      const openCreated = rows[0]?.open_created ?? 0;
      if (openCreated >= maxOpenCreated) {
        return apiError("p2p_open_orders_limit", {
          status: 409,
          details: { max: maxOpenCreated, open: openCreated },
        });
      }
    }

    // 2) Block creating multiple simultaneous orders against the same ad.
    const existingForAd = await sql<{ id: string }[]>`
      SELECT id::text
      FROM p2p_order
      WHERE buyer_id = ${actingUserId}::uuid
        AND ad_id = ${ad_id}::uuid
        AND status IN ('created', 'paid_confirmed', 'disputed')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (existingForAd.length > 0) {
      return apiError("p2p_order_duplicate_open", {
        status: 409,
        details: { order_id: existingForAd[0]!.id },
      });
    }

    // 3) Cooldown for buyers who repeatedly let orders expire (payment timeout).
    // Heuristic: treat cancelled orders where cancelled_at >= expires_at as timeouts.
    const windowHours = Number(process.env.P2P_TIMEOUT_WINDOW_HOURS ?? "24");
    const minTimeouts = Number(process.env.P2P_TIMEOUT_MIN_COUNT ?? "5");
    const ratioThreshold = Number(process.env.P2P_TIMEOUT_RATIO_THRESHOLD ?? "0.6");
    const cooldownMinutes = Number(process.env.P2P_TIMEOUT_COOLDOWN_MINUTES ?? "60");

    if (
      Number.isFinite(windowHours) &&
      Number.isFinite(minTimeouts) &&
      Number.isFinite(ratioThreshold) &&
      Number.isFinite(cooldownMinutes) &&
      windowHours > 0 &&
      minTimeouts > 0 &&
      ratioThreshold > 0 &&
      cooldownMinutes > 0
    ) {
      const rows = await sql<
        {
          total_created: number;
          timeout_count: number;
          last_timeout_at: Date | null;
        }[]
      >`
        WITH recent AS (
          SELECT
            status,
            created_at,
            cancelled_at,
            expires_at
          FROM p2p_order
          WHERE buyer_id = ${actingUserId}::uuid
            AND created_at >= now() - make_interval(hours => ${windowHours})
        ),
        timeouts AS (
          SELECT cancelled_at
          FROM recent
          WHERE status = 'cancelled'
            AND cancelled_at IS NOT NULL
            AND expires_at IS NOT NULL
            AND cancelled_at >= expires_at
        )
        SELECT
          (SELECT count(*)::int FROM recent) AS total_created,
          (SELECT count(*)::int FROM timeouts) AS timeout_count,
          (SELECT max(cancelled_at) FROM timeouts) AS last_timeout_at
      `;

      const totalCreated = rows[0]?.total_created ?? 0;
      const timeoutCount = rows[0]?.timeout_count ?? 0;
      const lastTimeoutAt = rows[0]?.last_timeout_at ?? null;

      const ratio = totalCreated > 0 ? timeoutCount / totalCreated : 0;
      if (timeoutCount >= minTimeouts && ratio >= ratioThreshold && lastTimeoutAt) {
        const cooldownEndsAt = new Date(lastTimeoutAt.getTime() + cooldownMinutes * 60_000);
        if (cooldownEndsAt.getTime() > Date.now()) {
          return apiError("p2p_order_create_cooldown", {
            status: 429,
            details: {
              cooldown_ends_at: cooldownEndsAt.toISOString(),
              window_hours: windowHours,
              timeout_count: timeoutCount,
              total_created: totalCreated,
            },
          });
        }
      }
    }

    const orderId = await sql.begin(async (txArg) => {
      const tx = txArg as any;

      // 1. Fetch & lock the ad
      // NOTE: payment_method_ids can be a legacy JSONB string containing a JSON array.
      // Compute a stable JSON array view in SQL so we don't depend on driver array decoding.
      const [ad] = await tx`
        SELECT
          ad.*,
          to_json(
            (
              CASE
                WHEN jsonb_typeof(
                  CASE
                    WHEN jsonb_typeof(ad.payment_method_ids) = 'array' THEN ad.payment_method_ids
                    WHEN jsonb_typeof(ad.payment_method_ids) = 'string' AND left((ad.payment_method_ids #>> '{}'), 1) = '[' THEN (ad.payment_method_ids #>> '{}')::jsonb
                    ELSE '[]'::jsonb
                  END
                ) = 'array' THEN (
                  SELECT array_agg(x)
                  FROM jsonb_array_elements_text(
                    CASE
                      WHEN jsonb_typeof(ad.payment_method_ids) = 'array' THEN ad.payment_method_ids
                      WHEN jsonb_typeof(ad.payment_method_ids) = 'string' AND left((ad.payment_method_ids #>> '{}'), 1) = '[' THEN (ad.payment_method_ids #>> '{}')::jsonb
                      ELSE '[]'::jsonb
                    END
                  ) AS x
                )
                ELSE ARRAY[]::text[]
              END
            )
          )::jsonb AS payment_method_ids_json
        FROM p2p_ad ad
        WHERE ad.id = ${ad_id}
        FOR UPDATE
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
      const adMethodIds = parseJsonbTextArray((ad as any).payment_method_ids_json);

      // If maker is seller, buyer should receive seller's ad payment methods.
      if (makerId === sellerId) {
        if (adMethodIds.length === 0) {
          throw new Error("seller_payment_details_missing");
        }

        const methods = await tx`
          SELECT id, identifier, name, details
          FROM p2p_payment_method
          WHERE id::text = ANY(${adMethodIds})
            AND user_id = ${sellerId}::uuid
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
          WHERE id = ${payment_method_id}::uuid
            AND user_id = ${sellerId}::uuid
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

      // g. Notify Taker
      await createNotification(tx, {
        userId: takerId,
        type: "p2p_order_created",
        title: "P2P Order Created",
        body: `Your order was created for ${amount_fiat} ${ad.fiat_currency}. Await payment / release steps in the order chat.`,
        metadata: { order_id: newOrder.id },
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
