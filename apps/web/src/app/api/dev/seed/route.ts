import { z } from "zod";

import { getSql } from "@/lib/db";
import { computeDeviationPct, computePriceBand } from "@/lib/market/band";
import { fetchMarketSnapshot } from "@/lib/market";
import type { ExchangeId } from "@/lib/market/types";
import { syntheticMarketSnapshot } from "@/lib/market/synthetic";
import { assessRiskV0 } from "@/lib/risk/v0";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const seedSchema = z
  .object({
    exchange: z.enum(["binance", "bybit"]).optional().default("binance"),
    symbol: z.string().min(3).max(30).optional().default("BTCUSDT"),
    pct: z.coerce.number().gt(0).lt(0.5).optional().default(0.01),
    price: z.coerce.string().optional(),
  })
  .optional();


export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return apiError("not_found");
  }

  const sql = getSql();
  const json = await request.json().catch(() => ({}));
  let input: z.infer<NonNullable<typeof seedSchema>> | undefined;
  try {
    input = seedSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const exchange = (input?.exchange ?? "binance") as ExchangeId;
  const symbol = input?.symbol ?? "BTCUSDT";
  const pct = input?.pct ?? 0.01;

  const snapshot = await fetchMarketSnapshot(exchange, symbol).catch((err) =>
    syntheticMarketSnapshot(exchange, symbol, { err })
  );

  // Pick a plausible quote price if none provided.
  const fallbackMid = computePriceBand(snapshot, pct).mid;
  const price = input?.price ?? fallbackMid;

  try {
    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const buyerRows = await txSql<{ id: string }[]>`
      INSERT INTO app_user (status, kyc_level, country)
      VALUES ('active', 'basic', 'US')
      RETURNING id
    `;

    const sellerRows = await txSql<{ id: string }[]>`
      INSERT INTO app_user (status, kyc_level, country)
      VALUES ('active', 'basic', 'US')
      RETURNING id
    `;

    const buyer_user_id = buyerRows[0]!.id;
    const seller_user_id = sellerRows[0]!.id;

    const band = computePriceBand(snapshot, pct);
    const deviation = computeDeviationPct(price, band.mid);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshotRows = await (txSql as any)<{ id: string }[]>`
      INSERT INTO market_snapshot (exchange, symbol, last, bid, ask, ts, raw_json)
      VALUES (
        ${snapshot.exchange},
        ${snapshot.symbol},
        ${snapshot.last},
        ${snapshot.bid},
        ${snapshot.ask},
        ${snapshot.ts.toISOString()},
        ${snapshot.raw}::jsonb
      )
      RETURNING id
    `;

    const reference_market_snapshot_id = snapshotRows[0]!.id;

    const tradeRows = await txSql<
      {
        id: string;
        status: string;
        created_at: string;
      }[]
    >`
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
        reference_market_snapshot_id,
        fair_price_mid,
        fair_price_lower,
        fair_price_upper,
        fair_band_pct,
        fair_price_basis,
        price_deviation_pct
      ) VALUES (
        ${buyer_user_id},
        ${seller_user_id},
        'USD',
        'BTC',
        '1000.00',
        '0.010000000000000000',
        ${price},
        'Zelle',
        'reversible',
        'created',
        ${reference_market_snapshot_id},
        ${band.mid},
        ${band.lower},
        ${band.upper},
        ${band.pct},
        ${band.basis},
        ${deviation}
      )
      RETURNING id, status, created_at
    `;

    const trade_id = tradeRows[0]!.id;

    await txSql`
      INSERT INTO trade_state_transition (
        trade_id,
        from_status,
        to_status,
        actor_user_id,
        actor_type,
        reason_code
      ) VALUES (
        ${trade_id},
        NULL,
        'created',
        ${buyer_user_id},
        'system',
        'dev_seed'
      )
    `;

    const riskAssessment = assessRiskV0({
      payment_method_risk_class: "reversible",
      price_deviation_pct: deviation,
      fair_band_pct: band.pct,
      has_reference_snapshot: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persistedRisk = await (txSql as any)<{ id: string; created_at: string }[]>`
      INSERT INTO risk_assessment (
        trade_id,
        score,
        version,
        factors_json,
        recommended_action,
        market_snapshot_id
      ) VALUES (
        ${trade_id},
        ${riskAssessment.score},
        ${riskAssessment.version},
        ${riskAssessment.factors}::jsonb,
        ${riskAssessment.recommended_action},
        ${reference_market_snapshot_id}
      )
      RETURNING id, created_at
    `;

    return {
      buyer_user_id,
      seller_user_id,
      trade_id,
      reference_market_snapshot_id,
      risk_assessment: {
        ...riskAssessment,
        id: persistedRisk[0]!.id,
        created_at: persistedRisk[0]!.created_at,
      },
    };
    });

    return Response.json(result, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("dev.seed", e);
    if (resp) return resp;
    throw e;
  }
}
