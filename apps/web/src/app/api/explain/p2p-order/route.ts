import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { maybeRephraseExplainFields, wantAiFromQueryParam } from "@/lib/explain/aiRephrase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  id: z.string().uuid(),
  ai: z.string().optional(),
});

function explain(status: string) {
  switch (status) {
    case "created":
      return {
        state: "created",
        summary: "Order created. Waiting for buyer to confirm payment.",
        blockers: ["Buyer has not confirmed payment"],
        next_steps: ["Buyer: click 'I have paid'", "Seller: wait, then release after confirming"],
      };
    case "paid_confirmed":
      return {
        state: "paid_confirmed",
        summary: "Buyer marked payment as sent. Seller must release.",
        blockers: ["Seller has not released escrow"],
        next_steps: ["Seller: confirm payment, then release", "Buyer: wait"],
      };
    case "completed":
      return {
        state: "completed",
        summary: "Order completed. Escrow released.",
        blockers: [],
        next_steps: ["Leave feedback"],
      };
    case "cancelled":
      return {
        state: "cancelled",
        summary: "Order cancelled.",
        blockers: [],
        next_steps: ["No action needed"],
      };
    case "disputed":
      return {
        state: "disputed",
        summary: "Order disputed. Admin review required.",
        blockers: ["Admin review"],
        next_steps: ["Provide evidence in chat", "Wait for resolution"],
      };
    default:
      return {
        state: status,
        summary: "P2P order status updated.",
        blockers: [],
        next_steps: ["Check order details"],
      };
  }
}

/**
 * GET /api/explain/p2p-order?id=<uuid>
 */
export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();
  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const url = new URL(request.url);
    let q: z.infer<typeof querySchema>;
    try {
      q = querySchema.parse({
        id: url.searchParams.get("id") ?? "",
        ai: url.searchParams.get("ai") ?? undefined,
      });
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const row = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<
        {
          id: string;
          status: string;
          fiat_currency: string;
          amount_fiat: string;
          amount_asset: string;
          asset_symbol: string;
          buyer_id: string;
          seller_id: string;
          maker_id: string;
          taker_id: string;
          created_at: string;
          expires_at: string;
        }[]
      >`
        SELECT
          o.id::text,
          o.status,
          o.fiat_currency,
          o.amount_fiat::text,
          o.amount_asset::text,
          a.symbol AS asset_symbol,
          o.buyer_id::text,
          o.seller_id::text,
          o.maker_id::text,
          o.taker_id::text,
          o.created_at,
          o.expires_at
        FROM p2p_order o
        JOIN ex_asset a ON a.id = o.asset_id
        WHERE o.id = ${q.id}::uuid
          AND (
            o.buyer_id = ${actingUserId}::uuid
            OR o.seller_id = ${actingUserId}::uuid
            OR o.maker_id = ${actingUserId}::uuid
            OR o.taker_id = ${actingUserId}::uuid
          )
        LIMIT 1
      `;
      return rows[0] ?? null;
    });

    if (!row) return apiError("not_found");

    const ex = explain(row.status);
    const ai = await maybeRephraseExplainFields({
      sql,
      actingUserId,
      wantAi: wantAiFromQueryParam(q.ai ?? null),
      kind: "p2p_order",
      fields: {
        summary: ex.summary,
        blockers: ex.blockers,
        next_steps: ex.next_steps,
      },
      headers: request.headers,
      context: {
        status: row.status,
        asset_symbol: row.asset_symbol,
        fiat_currency: row.fiat_currency,
      },
    });

    return Response.json({
      ok: true,
      kind: "p2p_order",
      id: row.id,
      status: row.status,
      asset_symbol: row.asset_symbol,
      amount_asset: row.amount_asset,
      fiat_currency: row.fiat_currency,
      amount_fiat: row.amount_fiat,
      created_at: row.created_at,
      expires_at: row.expires_at,
      ...ex,
      ...(ai ?? {}),
    });
  } catch (e) {
    const resp = responseForDbError("explain.p2p-order", e);
    if (resp) return resp;
    throw e;
  }
}
