import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiUpstreamUnavailable, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { fetchMarketSnapshot } from "@/lib/market";
import type { ExchangeId } from "@/lib/market/types";
import { computeDeviationPct, computePriceBand } from "@/lib/market/band";
import { assessRiskV0 } from "@/lib/risk/v0";

const createTradeSchema = z.object({
  buyer_user_id: z.string().uuid(),
  seller_user_id: z.string().uuid(),
  fiat_currency: z.string().min(3).max(10),
  crypto_asset: z.string().min(2).max(16),
  fiat_amount: z.coerce.string(),
  crypto_amount: z.coerce.string(),
  price: z.coerce.string(),
  payment_method_label: z.string().min(1).max(100),
  payment_method_risk_class: z
    .enum(["irreversible", "reversible", "unknown"])
    .optional()
    .default("unknown"),
  expires_at: z.string().optional(),
  assess_risk: z.boolean().optional().default(true),
  reference_market: z
    .object({
      exchange: z.enum(["binance", "bybit"]),
      symbol: z.string().min(3).max(30),
      persist: z.boolean().optional().default(true),
      pct: z.coerce.number().gt(0).lt(0.5).optional().default(0.01),
    })
    .optional(),
});

export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof createTradeSchema>;
  try {
    input = createTradeSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  // If an acting user is provided (always in prod), require they are the buyer.
  if (actingUserId && actingUserId !== input.buyer_user_id) {
    return apiError("x_user_id_mismatch");
  }

  let users: { id: string; status: string }[];
  try {
    users = await sql<{ id: string; status: string }[]>`
      SELECT id, status
      FROM app_user
      WHERE id IN (${input.buyer_user_id}, ${input.seller_user_id})
    `;
  } catch (e) {
    const resp = responseForDbError("trades.create.users", e);
    if (resp) return resp;
    throw e;
  }

  const buyer = users.find((u) => u.id === input.buyer_user_id) ?? null;
  const seller = users.find((u) => u.id === input.seller_user_id) ?? null;

  if (!buyer) {
    return apiError("buyer_not_found");
  }
  if (!seller) {
    return apiError("seller_not_found");
  }
  if (buyer.status !== "active") {
    return apiError("buyer_not_active");
  }
  if (seller.status !== "active") {
    return apiError("seller_not_active");
  }

  const referenceSnapshot = input.reference_market
    ? await fetchMarketSnapshot(
        input.reference_market.exchange as ExchangeId,
        input.reference_market.symbol
      ).catch(() => null)
    : null;

  if (input.reference_market && !referenceSnapshot) {
    return apiUpstreamUnavailable({
      exchange: input.reference_market.exchange,
      symbol: input.reference_market.symbol,
    });
  }

  try {
    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    let referenceMarketSnapshotId: string | null = null;
    let fairPriceMid: string | null = null;
    let fairPriceLower: string | null = null;
    let fairPriceUpper: string | null = null;
    let fairBandPct: number | null = null;
    let fairPriceBasis: "bid_ask_mid" | "last" | null = null;
    let priceDeviationPct: number | null = null;

    if (referenceSnapshot) {
      const pct = input.reference_market?.pct ?? 0.01;
      const band = computePriceBand(referenceSnapshot, pct);
      fairPriceMid = band.mid;
      fairPriceLower = band.lower;
      fairPriceUpper = band.upper;
      fairBandPct = band.pct;
      fairPriceBasis = band.basis;
      priceDeviationPct = computeDeviationPct(input.price, band.mid);
    }

    if (referenceSnapshot && input.reference_market?.persist !== false) {
      const rows = await (txSql as any)<{
        id: string;
      }[]>`
        INSERT INTO market_snapshot (exchange, symbol, last, bid, ask, ts, raw_json)
        VALUES (
          ${referenceSnapshot.exchange},
          ${referenceSnapshot.symbol},
          ${referenceSnapshot.last},
          ${referenceSnapshot.bid},
          ${referenceSnapshot.ask},
          ${referenceSnapshot.ts.toISOString()},
          ${referenceSnapshot.raw as any}::jsonb
        )
        RETURNING id
      `;

      referenceMarketSnapshotId = rows[0]?.id ?? null;
    }

    const trades = await txSql`
      INSERT INTO trade (
        buyer_user_id,
        seller_user_id,
        fiat_currency,
        crypto_asset,
        fiat_amount,
        crypto_amount,
        price,
        payment_method_label,
        payment_method_risk_class,
        status,
        expires_at,
        reference_market_snapshot_id,
        fair_price_mid,
        fair_price_lower,
        fair_price_upper,
        fair_band_pct,
        fair_price_basis,
        price_deviation_pct
      ) VALUES (
        ${input.buyer_user_id},
        ${input.seller_user_id},
        ${input.fiat_currency},
        ${input.crypto_asset},
        ${input.fiat_amount},
        ${input.crypto_amount},
        ${input.price},
        ${input.payment_method_label},
        ${input.payment_method_risk_class},
        'created',
        ${input.expires_at ?? null},
        ${referenceMarketSnapshotId},
        ${fairPriceMid},
        ${fairPriceLower},
        ${fairPriceUpper},
        ${fairBandPct},
        ${fairPriceBasis},
        ${priceDeviationPct}
      )
      RETURNING
        id,
        status,
        created_at,
        reference_market_snapshot_id,
        fair_price_mid::text,
        fair_price_lower::text,
        fair_price_upper::text,
        fair_band_pct::text,
        fair_price_basis,
        price_deviation_pct::text
    `;

    const trade = trades[0] as {
      id: string;
      status: string;
      created_at: string;
      reference_market_snapshot_id: string | null;
      fair_price_mid: string | null;
      fair_price_lower: string | null;
      fair_price_upper: string | null;
      fair_band_pct: string | null;
      fair_price_basis: string | null;
      price_deviation_pct: string | null;
    };

    await txSql`
      INSERT INTO trade_state_transition (
        trade_id,
        from_status,
        to_status,
        actor_user_id,
        actor_type,
        reason_code
      ) VALUES (
        ${trade.id},
        NULL,
        ${trade.status},
        ${actingUserId ?? input.buyer_user_id},
        'user',
        'create_trade'
      )
    `;

    const riskAssessment = input.assess_risk
      ? assessRiskV0({
          payment_method_risk_class: input.payment_method_risk_class,
          price_deviation_pct:
            typeof priceDeviationPct === "number" && Number.isFinite(priceDeviationPct)
              ? priceDeviationPct
              : null,
          fair_band_pct:
            typeof fairBandPct === "number" && Number.isFinite(fairBandPct)
              ? fairBandPct
              : null,
          has_reference_snapshot: Boolean(referenceMarketSnapshotId),
        })
      : null;

    const persistedRisk = riskAssessment
      ? await (txSql as any)<{
          id: string;
          created_at: string;
        }[]>`
          INSERT INTO risk_assessment (
            trade_id,
            score,
            version,
            factors_json,
            recommended_action,
            market_snapshot_id
          ) VALUES (
            ${trade.id},
            ${riskAssessment.score},
            ${riskAssessment.version},
            ${riskAssessment.factors as any}::jsonb,
            ${riskAssessment.recommended_action},
            ${referenceMarketSnapshotId}
          )
          RETURNING id, created_at
        `
      : null;

    return {
      trade,
      risk_assessment: riskAssessment
        ? {
            ...riskAssessment,
            id: persistedRisk?.[0]?.id,
            created_at: persistedRisk?.[0]?.created_at,
          }
        : null,
    };
    });

    return Response.json(result, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("trades.create", e);
    if (resp) return resp;
    throw e;
  }
}

export async function GET(request: Request) {
  const sql = getSql();
  const url = new URL(request.url);
  const userIdQuery = url.searchParams.get("user_id");
  const actingUserId = getActingUserId(request);
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    const authErr = requireActingUserIdInProd(actingUserId);
    if (authErr) {
      return apiError(authErr);
    }

    if (userIdQuery && actingUserId && userIdQuery !== actingUserId) {
      return apiError("x_user_id_mismatch");
    }
  }

  const userId = actingUserId ?? userIdQuery;
  if (!userId) {
    return apiError("missing_user_id");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, userId));
    if (activeErr) {
      return apiError(activeErr);
    }

  if (!isProd && actingUserId && userIdQuery && actingUserId !== userIdQuery) {
    return apiError("x_user_id_mismatch");
  }
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

    const trades = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        buyer_user_id: string;
        seller_user_id: string;
        fiat_currency: string;
        crypto_asset: string;
        fiat_amount: string;
        crypto_amount: string;
        price: string;
        reference_market_snapshot_id: string | null;
        fair_price_mid: string | null;
        fair_band_pct: string | null;
        price_deviation_pct: string | null;
        status: string;
        created_at: string;
      }[]>`
        SELECT id, buyer_user_id, seller_user_id, fiat_currency, crypto_asset,
               fiat_amount::text, crypto_amount::text, price::text,
               reference_market_snapshot_id,
               fair_price_mid::text,
               fair_band_pct::text,
               price_deviation_pct::text,
               status, created_at
        FROM trade
        WHERE buyer_user_id = ${userId} OR seller_user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    });

    return Response.json({ trades });
  } catch (e) {
    const resp = responseForDbError("trades.list", e);
    if (resp) return resp;
    throw e;
  }
}
