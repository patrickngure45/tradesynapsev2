
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
    asset: z.enum(["USDT", "BNB"]).default("USDT"),
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = searchSchema.safeParse(Object.fromEntries(url.searchParams));
    
    if (!query.success) {
      return apiZodError(query.error) ?? apiError("invalid_input");
    }
    
    const { side, asset, fiat, amount } = query.data;
    const sql = getSql();

    const fiatUpper = fiat.toUpperCase();
    const assetUpper = asset.toUpperCase();

    // Note: If user wants to BUY, we look for ads with side='SELL'
    const targetSide = side === "BUY" ? "SELL" : "BUY";

    // 1. Get Asset ID
    const [assetRow] = await sql`
      SELECT id FROM ex_asset WHERE symbol = ${assetUpper} AND chain = 'bsc' LIMIT 1
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
          SELECT coalesce(jsonb_agg(DISTINCT pm.identifier), '[]'::jsonb)
          FROM p2p_payment_method pm
          WHERE pm.user_id = ad.user_id
            AND pm.is_enabled = true
            AND pm.id::text = ANY(
              CASE
                WHEN jsonb_typeof(ad.payment_method_ids) = 'array' THEN (
                  SELECT array_agg(x)
                  FROM jsonb_array_elements_text(ad.payment_method_ids) AS x
                )
                ELSE ARRAY[]::text[]
              END
            )
        ) AS payment_methods,
        u.email,
        u.display_name,
        ad.terms
      FROM p2p_ad ad
      JOIN app_user u ON ad.user_id = u.id
      WHERE ad.status = 'online'
        AND ad.side = ${targetSide}
        AND ad.asset_id = ${assetRow.id}
        AND ad.fiat_currency = ${fiatUpper}
        ${amount ? sql`AND ad.min_limit <= ${amount} AND ad.max_limit >= ${amount}` : sql``}
        AND ad.remaining_amount > 0
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
    const payload = createAdSchema.safeParse(body);
    if (!payload.success) return apiZodError(payload.error) ?? apiError("invalid_input");
    const data = payload.data;

    const fiatUpper = data.fiat.toUpperCase();

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
    const [targetAsset] = await sql`SELECT id FROM ex_asset WHERE symbol = ${data.asset} AND chain = 'bsc' LIMIT 1`;
    if (!targetAsset) return apiError("invalid_asset");

    // 3. For SELL ads, verify inventory via authoritative availability check:
    // available = posted - active_holds
    if (data.side === "SELL") {
      const acctRows = await sql<{ id: string }[]>`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${actingUserId}::uuid, ${targetAsset.id}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `;

      const accountId = acctRows[0]!.id;

      const availRows = await sql<
        { posted: string; held: string; available: string; ok: boolean }[]
      >`
        WITH posted AS (
          SELECT coalesce(sum(amount), 0)::numeric AS posted
          FROM ex_journal_line
          WHERE account_id = ${accountId}::uuid
        ),
        held AS (
          SELECT coalesce(sum(amount), 0)::numeric AS held
          FROM ex_hold
          WHERE account_id = ${accountId}::uuid AND status = 'active'
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

    // 4. Create the Ad
    const [newAd] = await sql`
      INSERT INTO p2p_ad (
        user_id, side, asset_id, fiat_currency,
        price_type, fixed_price, total_amount, remaining_amount,
        min_limit, max_limit, payment_window_minutes, terms,
        status, payment_method_ids,
        reference_mid, reference_sources, reference_computed_at, price_band_pct
      ) VALUES (
        ${actingUserId}, ${data.side}, ${targetAsset.id}, ${fiatUpper},
        ${data.price_type}, ${data.fixed_price}, ${data.total_amount}, ${data.total_amount},
        ${data.min_limit}, ${data.max_limit}, ${data.payment_window_minutes}, ${data.terms || ""},
        'online', ${JSON.stringify(paymentMethodIds)}::jsonb,
        ${refMid}, ${refSources ? JSON.stringify(refSources) : "{}"}::jsonb, ${refComputedAt ? refComputedAt.toISOString() : null},
        ${refMid ? getBandPctForFiat(data.fiat) : null}
      )
      RETURNING id
    `;

    return NextResponse.json({ success: true, id: newAd.id });

  } catch (err: any) {
    console.error("POST /api/p2p/ads error:", err);
    return apiError("internal_error");
  }
}
