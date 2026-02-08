import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, isParty, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

const tradeIdSchema = z.string().uuid();

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
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) {
      return apiError(activeErr);
    }

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
        fair_price_lower: string | null;
        fair_price_upper: string | null;
        fair_band_pct: string | null;
        fair_price_basis: string | null;
        price_deviation_pct: string | null;
        status: string;
        created_at: string;
        expires_at: string | null;
        paid_marked_at: string | null;
        released_at: string | null;
        canceled_at: string | null;
      }[]>`
        SELECT id, buyer_user_id, seller_user_id, fiat_currency, crypto_asset,
               fiat_amount::text, crypto_amount::text, price::text,
               reference_market_snapshot_id,
               fair_price_mid::text,
               fair_price_lower::text,
               fair_price_upper::text,
               fair_band_pct::text,
               fair_price_basis,
               price_deviation_pct::text,
               status,
               created_at, expires_at, paid_marked_at, released_at, canceled_at
        FROM trade
        WHERE id = ${id}
        LIMIT 1
      `;
    });

    if (trades.length === 0) {
      return apiError("not_found");
    }

    if (actingUserId && !isParty(actingUserId, trades[0])) {
      return apiError("not_party");
    }

    const transitions = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        from_status: string | null;
        to_status: string;
        actor_user_id: string | null;
        actor_type: string;
        reason_code: string | null;
        created_at: string;
      }[]>`
        SELECT id, from_status, to_status, actor_user_id, actor_type, reason_code, created_at
        FROM trade_state_transition
        WHERE trade_id = ${id}
        ORDER BY created_at ASC
      `;
    });

    return Response.json({ trade: trades[0], transitions });
  } catch (e) {
    const resp = responseForDbError("trades.get", e);
    if (resp) return resp;
    throw e;
  }
}
