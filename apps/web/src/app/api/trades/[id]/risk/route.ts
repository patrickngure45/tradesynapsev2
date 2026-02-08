import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, isParty, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { assessRiskV0 } from "@/lib/risk/v0";

const postSchema = z
  .object({
    version: z.literal("v0").optional().default("v0"),
  })
  .optional();

const tradeIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sql = getSql();
  const { id } = await params;

  try {
    tradeIdSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() =>
      requireActiveUser(sql, actingUserId)
    );
    if (activeErr) {
      return apiError(activeErr);
    }

  const json = await request.json().catch(() => ({}));
  let input: z.infer<NonNullable<typeof postSchema>> | undefined;
  try {
    input = postSchema?.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }
  if (!input || input.version !== "v0") {
    return apiError("unsupported_version");
  }

    const rows = await sql<{
    id: string;
    buyer_user_id: string;
    seller_user_id: string;
    payment_method_risk_class: "irreversible" | "reversible" | "unknown";
    reference_market_snapshot_id: string | null;
    fair_band_pct: string | null;
    price_deviation_pct: string | null;
  }[]>`
    SELECT
      id,
      buyer_user_id,
      seller_user_id,
      payment_method_risk_class,
      reference_market_snapshot_id,
      fair_band_pct::text,
      price_deviation_pct::text
    FROM trade
    WHERE id = ${id}
    LIMIT 1
  `;

    if (rows.length === 0) {
      return apiError("not_found");
    }

    const trade = rows[0];

    if (actingUserId && !isParty(actingUserId, trade)) {
      return apiError("not_party");
    }

  const fairBandPct = trade.fair_band_pct ? Number(trade.fair_band_pct) : null;
  const deviationPct = trade.price_deviation_pct
    ? Number(trade.price_deviation_pct)
    : null;

  const assessment = assessRiskV0({
    payment_method_risk_class: trade.payment_method_risk_class,
    price_deviation_pct: Number.isFinite(deviationPct as number)
      ? (deviationPct as number)
      : null,
    fair_band_pct: Number.isFinite(fairBandPct as number) ? (fairBandPct as number) : null,
    has_reference_snapshot: Boolean(trade.reference_market_snapshot_id),
  });

    const inserted = await (sql as any)<{
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
      ${id},
      ${assessment.score},
      ${assessment.version},
      ${assessment.factors as any}::jsonb,
      ${assessment.recommended_action},
      ${trade.reference_market_snapshot_id}
    )
    RETURNING id, created_at
  `;

    return Response.json(
      {
        risk_assessment: {
          ...assessment,
          id: inserted[0]?.id,
          created_at: inserted[0]?.created_at,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    const resp = responseForDbError("trades.risk.assess", e);
    if (resp) return resp;
    throw e;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sql = getSql();
  const { id } = await params;

  try {
    tradeIdSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() =>
      requireActiveUser(sql, actingUserId)
    );
    if (activeErr) {
      return apiError(activeErr);
    }

    if (actingUserId) {
      const trades = await retryOnceOnTransientDbError(async () => {
        return await sql<{ buyer_user_id: string; seller_user_id: string }[]>`
          SELECT buyer_user_id, seller_user_id
          FROM trade
          WHERE id = ${id}
          LIMIT 1
        `;
      });
      if (trades.length === 0) {
        return apiError("not_found");
      }
      if (!isParty(actingUserId, trades[0]!)) {
        return apiError("not_party");
      }
    }

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        score: number;
        version: string;
        factors_json: unknown;
        recommended_action: "allow" | "friction" | "bond" | "hold" | "block";
        market_snapshot_id: string | null;
        created_at: string;
      }[]>`
        SELECT
          id,
          score,
          version,
          factors_json,
          recommended_action,
          market_snapshot_id,
          created_at
        FROM risk_assessment
        WHERE trade_id = ${id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    });

    return Response.json({ risk_assessment: rows[0] ?? null });
  } catch (e) {
    const resp = responseForDbError("trades.risk.get", e);
    if (resp) return resp;
    throw e;
  }
}
