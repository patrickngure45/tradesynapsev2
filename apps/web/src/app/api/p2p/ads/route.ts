
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getOrComputeFxReferenceRate } from "@/lib/fx/reference";
import { isSupportedP2PCountry } from "@/lib/p2p/supportedCountries";

export const dynamic = "force-dynamic";

// Schema for query parameters
const searchSchema = z.object({
  side: z.enum(["BUY", "SELL"]).default("BUY"), 
  asset: z.string().default("USDT"),
  fiat: z.string().default("USD"),
  amount: z.coerce.number().optional(),
});

// Schema for creating an ad
const createAdSchema = z
  .object({
    side: z.enum(["BUY", "SELL"]),
    asset: z.string().min(2).max(12).transform((s) => s.trim().toUpperCase()),
    fiat: z.string().min(2).max(5),
    price_type: z.enum(["fixed", "floating"]).default("fixed"),
    fixed_price: z.number().positive(),
    total_amount: z.number().positive(),
    min_limit: z.number().positive(),
    max_limit: z.number().positive(),
    terms: z.string().optional(),
    payment_window_minutes: z.number().min(15).max(180).default(15),
    // For SELL ads, these must be UUIDs of the seller's saved payout methods.
    // For BUY ads, this should be omitted or an empty array.
    payment_methods: z.array(z.string().uuid()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.side === "SELL") {
      if (!data.payment_methods || data.payment_methods.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payment_methods"],
          message: "SELL ads must include at least one payment method.",
        });
      }
    }

    if (data.min_limit > data.max_limit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["min_limit"],
        message: "min_limit must be <= max_limit.",
      });
    }
  });

function uniqStrings(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const v = String(raw);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function computeFloatingMultiplier(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;

  // Heuristic: allow either 1.05 (multiplier) OR 0.05 (delta) to represent +5%.
  // Keep it conservative to avoid insane prices.
  const m = Math.abs(n) <= 0.5 ? 1 + n : n;
  if (!Number.isFinite(m) || m <= 0) return null;
  return Math.min(2.5, Math.max(0.5, m));
}

function getBandPctForFiat(fiat: string): number {
  const f = fiat.toUpperCase();
  const specific = process.env[`P2P_PRICE_BAND_PCT_${f}`];
  const raw = specific ?? process.env.P2P_PRICE_BAND_PCT ?? "0.02";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0.02;
  return Math.min(0.25, Math.max(0.001, n));
}

function isAtLeastBasicKyc(raw: unknown): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "basic" || v === "verified" || v === "full";
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = searchSchema.safeParse(Object.fromEntries(url.searchParams));
    
    if (!query.success) {
      return apiZodError(query.error) ?? apiError("invalid_input");
    }
    
    const { side, asset, fiat, amount } = query.data;
    const sql = getSql();

    const agentEmails = new Set(
      String(process.env.P2P_AGENT_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );

    const fiatUpper = fiat.toUpperCase();
    const assetUpper = asset.toUpperCase();

    // Note: If user wants to BUY, we look for ads with side='SELL'
    const targetSide = side === "BUY" ? "SELL" : "BUY";

    // For SELL ads (maker is seller), we must ensure there are usable payout details.
    // Otherwise the taker can't pay because we can't show valid destination details.
    const requireSellerPaymentDetails = targetSide === "SELL";

    // 1. Get Asset ID
    const [assetRow] = await sql`
      SELECT id
      FROM ex_asset
      WHERE symbol = ${assetUpper}
        AND chain = 'bsc'
        AND is_enabled = true
      LIMIT 1
    `;
    
    if (!assetRow) {
      return NextResponse.json({ ads: [] });
    }

    // 2. Fetch Ads
    // Fetch a few extra and sort in-process using a computed display price
    // (needed for floating-price ads).
    const ads = await sql`
      SELECT 
        ad.id,
        ad.user_id,
        ad.side,
        ad.fiat_currency,
        ad.price_type,
        ad.fixed_price,
        ad.margin_percent,
        ad.remaining_amount,
        ad.min_limit,
        ad.max_limit,
        ad.payment_window_minutes,
        ad.payment_method_ids,
        (
          SELECT coalesce(array_agg(DISTINCT pm.identifier), ARRAY[]::text[])
          FROM p2p_payment_method pm
          WHERE pm.user_id = ad.user_id
            AND pm.is_enabled = true
            AND pm.id::text = ANY(
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
        ) AS payment_methods,
        u.email,
        u.display_name,
        coalesce(rep.positive, 0)::int AS rep_positive,
        coalesce(rep.negative, 0)::int AS rep_negative,
        coalesce(rep.total, 0)::int AS rep_total,
        (
          SELECT count(*)::int
          FROM p2p_order o
          WHERE o.status = 'completed'
            AND (o.buyer_id = ad.user_id OR o.seller_id = ad.user_id)
        ) AS completed_count,
        ad.terms
      FROM p2p_ad ad
      JOIN app_user u ON ad.user_id = u.id
      LEFT JOIN (
        SELECT
          to_user_id,
          sum(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END)::int AS positive,
          sum(CASE WHEN rating = 'negative' THEN 1 ELSE 0 END)::int AS negative,
          count(*)::int AS total
        FROM p2p_feedback
        GROUP BY to_user_id
      ) rep ON rep.to_user_id = ad.user_id
      WHERE ad.status = 'online'
        AND ad.side = ${targetSide}
        AND ad.asset_id = ${assetRow.id}
        AND ad.fiat_currency = ${fiatUpper}
        ${amount ? sql`AND ad.min_limit <= ${amount} AND ad.max_limit >= ${amount}` : sql``}
        AND ad.remaining_amount > 0
        ${
          requireSellerPaymentDetails
            ? sql`
              AND EXISTS (
                SELECT 1
                FROM p2p_payment_method pm2
                WHERE pm2.user_id = ad.user_id
                  AND pm2.is_enabled = true
                  AND pm2.id::text = ANY(
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
                  AND pm2.details IS NOT NULL
                  AND jsonb_typeof(pm2.details) = 'object'
                  AND pm2.details <> '{}'::jsonb
              )
            `
            : sql``
        }
      ORDER BY ad.created_at DESC
      LIMIT 200
    `;

    // Compute a single reference mid for the pair, used for floating ads.
    const ref = await getOrComputeFxReferenceRate(sql, assetUpper, fiatUpper);
    const refMid = ref?.mid ?? null;

    const hydrated = (ads ?? [])
      .map((ad: any) => {
        const priceType = String(ad.price_type ?? "fixed");
        let displayPrice: number | null = null;

        if (priceType === "fixed") {
          const p = Number(ad.fixed_price);
          displayPrice = Number.isFinite(p) && p > 0 ? p : null;
        } else {
          const mult = computeFloatingMultiplier(ad.margin_percent);
          if (refMid && mult) {
            displayPrice = refMid * mult;
          }
        }

        return {
          ...ad,
          is_verified_agent: agentEmails.size > 0 ? agentEmails.has(String(ad.email ?? "").toLowerCase()) : false,
          // Keep UI compatibility: provide a string price field.
          fixed_price: displayPrice !== null ? String(displayPrice) : null,
          _display_price: displayPrice,
        };
      })
      .filter((ad: any) => ad._display_price !== null);

    const sorted = hydrated.sort((a: any, b: any) => {
      // When user wants to BUY, targetSide is SELL, show lowest first.
      // When user wants to SELL, targetSide is BUY, show highest first.
      const pa = a._display_price as number;
      const pb = b._display_price as number;
      return targetSide === "SELL" ? pa - pb : pb - pa;
    });

    const out = sorted.slice(0, 50).map((ad: any) => {
      const { _display_price, ...rest } = ad;
      return rest;
    });
    return NextResponse.json({ ads: out });
  } catch (error: any) {
    return apiError(error.message || "internal_error", { details: error });
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

    const userRows = await sql<{ country: string | null; email_verified: boolean | null; kyc_level: string | null }[]>`
      SELECT country, email_verified, kyc_level
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
    const payload = createAdSchema.safeParse(body);
    if (!payload.success) return apiZodError(payload.error) ?? apiError("invalid_input");
    const data = payload.data;

    // Anti-spam: limit how many online ads a single user can have at once.
    // Applies to both BUY and SELL ads.
    const maxOnlineAds = Math.max(0, Math.min(100, Number(process.env.P2P_MAX_ONLINE_ADS_PER_USER ?? "3")));
    if (maxOnlineAds > 0) {
      const rows = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM p2p_ad
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'online'
      `;
      const current = Number(rows[0]?.n ?? 0);
      if (Number.isFinite(current) && current >= maxOnlineAds) {
        return apiError("ad_limit_reached", {
          status: 409,
          details: { max_online_ads: maxOnlineAds },
        });
      }
    }

    // Posting gates (SELL ads only): offloading is the risky direction.
    if (data.side === "SELL") {
      const emailVerified = Boolean(userRows[0]?.email_verified);
      if (!emailVerified) {
        return apiError("email_not_verified", {
          status: 403,
          details: { message: "Verify your email before posting SELL ads." },
        });
      }
      if (!isAtLeastBasicKyc(userRows[0]?.kyc_level)) {
        return apiError("kyc_required", {
          status: 403,
          details: { message: "Complete Basic KYC before posting SELL ads." },
        });
      }
    }

    const fiatUpper = data.fiat.toUpperCase();

    // Global limits (Binance-style): enforce a USD-based minimum/maximum per trade.
    // Defaults: min=$5, max=$2000. Can be overridden by env.
    let minUsd = clamp(Number(process.env.P2P_MIN_TRADE_USD ?? "5"), 0.5, 10_000);
    const maxUsd = clamp(Number(process.env.P2P_MAX_TRADE_USD ?? "2000"), minUsd, 100_000);

    // SELL ads (offloading) should be meaningfully sized to reduce spam & micro-ads.
    // Default: $20-equivalent minimum per trade.
    if (data.side === "SELL") {
      const sellMinUsd = clamp(Number(process.env.P2P_MIN_SELL_AD_TRADE_USD ?? "20"), 0.5, 10_000);
      minUsd = Math.max(minUsd, sellMinUsd);
    }

    // Compute the fiat conversion for USDT (USDT≈USD). If unavailable, we can't safely enforce limits.
    const usdtFiat = await getOrComputeFxReferenceRate(sql as any, "USDT", fiatUpper);
    if (!usdtFiat?.mid) {
      return apiError("fx_unavailable", { status: 503, details: { base: "USDT", quote: fiatUpper } });
    }

    const minFiat = Math.ceil(minUsd * usdtFiat.mid);
    const maxFiat = Math.floor(maxUsd * usdtFiat.mid);
    if (!(Number.isFinite(minFiat) && Number.isFinite(maxFiat) && minFiat > 0 && maxFiat >= minFiat)) {
      return apiError("fx_unavailable", { status: 503, details: { base: "USDT", quote: fiatUpper } });
    }

    // Additional SELL-ad guardrail: require the *ad’s total liquidity* to be non-trivial.
    // This reduces spam (micro-ads) while still allowing normal sellers.
    // Default: $50-equivalent total notional.
    if (data.side === "SELL") {
      const minTotalUsd = clamp(Number(process.env.P2P_MIN_SELL_AD_TOTAL_USD ?? "50"), 0.5, 100_000);
      const minTotalFiat = Math.ceil(minTotalUsd * usdtFiat.mid);
      const totalFiat = Math.floor(data.total_amount * data.fixed_price);
      if (!Number.isFinite(totalFiat) || totalFiat <= 0) {
        return apiError("invalid_input", { details: { message: "Ad liquidity is too low." } });
      }
      if (totalFiat < minTotalFiat) {
        return apiError("ad_liquidity_too_low", {
          status: 409,
          details: {
            total_fiat: totalFiat,
            required_min_total: minTotalFiat,
            fiat: fiatUpper,
            min_total_usd: minTotalUsd,
          },
        });
      }
    }

    if (data.min_limit < minFiat) {
      return apiError("min_limit_too_low", {
        status: 409,
        details: { min_limit: data.min_limit, required_min: minFiat, fiat: fiatUpper, min_usd: minUsd },
      });
    }
    if (data.max_limit > maxFiat) {
      return apiError("max_limit_too_high", {
        status: 409,
        details: { max_limit: data.max_limit, allowed_max: maxFiat, fiat: fiatUpper, max_usd: maxUsd },
      });
    }

    // Validate payment method ownership for SELL ads.
    let paymentMethodIds: string[] = [];
    if (data.side === "SELL") {
      paymentMethodIds = uniqStrings(data.payment_methods ?? []).slice(0, 3);
      const owned = await sql<{ id: string }[]>`
        SELECT id::text AS id
        FROM p2p_payment_method
        WHERE user_id = ${actingUserId}::uuid
          AND is_enabled = true
          AND id::text = ANY(${paymentMethodIds})
      `;
      if (owned.length !== paymentMethodIds.length) {
        return apiError("invalid_input", {
          details: { message: "One or more payment methods are invalid or not yours." },
        });
      }
    }

    // Optional reference snapshot for guardrails / analytics (best-effort).
    let refMid: number | null = null;
    let refSources: Record<string, unknown> | null = null;
    let refComputedAt: Date | null = null;
    if (data.price_type === "fixed") {
      const ref = await getOrComputeFxReferenceRate(sql, data.asset, fiatUpper);
      if (ref) {
        refMid = ref.mid;
        refSources = ref.sources;
        refComputedAt = ref.computedAt;
      }
    }

    // 2. Identify the asset being traded
    const [targetAsset] = await sql`
      SELECT id
      FROM ex_asset
      WHERE chain = 'bsc'
        AND is_enabled = true
        AND symbol = ${data.asset}
      LIMIT 1
    `;
    if (!targetAsset) return apiError("invalid_asset");

    // 3. For SELL ads, verify inventory via authoritative availability check:
    // available = posted - sum(active_holds.remaining_amount)
    // (remaining_amount supports partial consumption)
    let sellerAccountId: string | null = null;
    if (data.side === "SELL") {
      const acctRows = await sql<{ id: string }[]>`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${actingUserId}::uuid, ${targetAsset.id}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `;

      sellerAccountId = acctRows[0]!.id;

      const availRows = await sql<
        { posted: string; held: string; available: string; ok: boolean }[]
      >`
        WITH posted AS (
          SELECT coalesce(sum(amount), 0)::numeric AS posted
          FROM ex_journal_line
          WHERE account_id = ${sellerAccountId}::uuid
        ),
        held AS (
          SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
          FROM ex_hold
          WHERE account_id = ${sellerAccountId}::uuid AND status = 'active'
        )
        SELECT
          posted.posted::text AS posted,
          held.held::text AS held,
          (posted.posted - held.held)::text AS available,
          ((posted.posted - held.held) >= (${data.total_amount}::numeric)) AS ok
        FROM posted, held
      `;

      const available = Number(availRows[0]?.available ?? "0");
      if (!availRows[0]?.ok) {
        return apiError("insufficient_funds", {
          details: {
            message: `You want to sell ${data.total_amount} ${data.asset}, but only have ${available} available (after escrow).`,
          },
        });
      }
    }

    // 4. Create the Ad (and inventory hold for SELL ads)
    // Extra sanity: ensure max_limit is compatible with the ad's total liquidity.
    // max_limit (fiat) must not exceed total_amount(asset) * fixed_price(fiat/asset).
    const maxByLiquidity = Math.floor(data.total_amount * data.fixed_price);
    if (maxByLiquidity <= 0) {
      return apiError("invalid_input", { details: { message: "Ad liquidity is too low." } });
    }
    const finalMaxLimit = Math.min(data.max_limit, maxByLiquidity);
    if (data.min_limit > finalMaxLimit) {
      return apiError("invalid_input", { details: { message: "min_limit must be <= max_limit." } });
    }

    const created = await sql.begin(async (tx) => {
      const [newAd] = await tx`
        INSERT INTO p2p_ad (
          user_id, side, asset_id, fiat_currency,
          price_type, fixed_price, total_amount, remaining_amount,
          min_limit, max_limit, payment_window_minutes, terms,
          status, payment_method_ids,
          reference_mid, reference_sources, reference_computed_at, price_band_pct
        ) VALUES (
          ${actingUserId}, ${data.side}, ${targetAsset.id}, ${fiatUpper},
          ${data.price_type}, ${data.fixed_price}, ${data.total_amount}, ${data.total_amount},
          ${data.min_limit}, ${finalMaxLimit}, ${data.payment_window_minutes}, ${data.terms || ""},
          'online', ${JSON.stringify(paymentMethodIds)}::jsonb,
          ${refMid}, ${refSources ? JSON.stringify(refSources) : "{}"}::jsonb, ${refComputedAt ? refComputedAt.toISOString() : null},
          ${refMid ? getBandPctForFiat(data.fiat) : null}
        )
        RETURNING id
      `;

      // Option A (backed ads): for SELL ads, reserve inventory in an ex_hold.
      if (data.side === "SELL") {
        const acctRows = await tx<{ id: string }[]>`
          INSERT INTO ex_ledger_account (user_id, asset_id)
          VALUES (${actingUserId}::uuid, ${targetAsset.id}::uuid)
          ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
          RETURNING id
        `;
        const accountId = acctRows[0]!.id;

        const holdRows = await tx<{ id: string }[]>`
          INSERT INTO ex_hold (account_id, asset_id, amount, remaining_amount, reason, status)
          VALUES (
            ${accountId}::uuid,
            ${targetAsset.id}::uuid,
            (${data.total_amount}::numeric),
            (${data.total_amount}::numeric),
            ${`p2p_ad:${newAd.id}`},
            'active'
          )
          RETURNING id
        `;

        await tx`
          UPDATE p2p_ad
          SET inventory_hold_id = ${holdRows[0]!.id}::uuid
          WHERE id = ${newAd.id}
        `;
      }

      return newAd;
    });

    return NextResponse.json({ success: true, id: created.id });

  } catch (err: any) {
    console.error("POST /api/p2p/ads error:", err);
    return apiError("internal_error");
  }
}
