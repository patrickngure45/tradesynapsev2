import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  id: z.string().uuid(),
});

function explain(status: string) {
  switch (status) {
    case "open":
      return {
        state: "open",
        summary: "Order is open in the book.",
        blockers: ["Waiting for a match"],
        next_steps: ["Wait for fills", "Cancel if you changed your mind"],
      };
    case "partially_filled":
      return {
        state: "partially_filled",
        summary: "Order has partial fills.",
        blockers: ["Remaining quantity still open"],
        next_steps: ["Wait for the rest to fill", "Cancel the remainder"],
      };
    case "filled":
      return {
        state: "filled",
        summary: "Order fully filled.",
        blockers: [],
        next_steps: ["View your balances", "View order history"],
      };
    case "canceled":
      return {
        state: "canceled",
        summary: "Order canceled.",
        blockers: [],
        next_steps: ["No action needed"],
      };
    default:
      return {
        state: status,
        summary: "Order status updated.",
        blockers: [],
        next_steps: ["Check order history"],
      };
  }
}

/**
 * GET /api/explain/order?id=<uuid>
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
      q = querySchema.parse({ id: url.searchParams.get("id") ?? "" });
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const row = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<
        {
          id: string;
          status: string;
          side: string;
          price: string;
          quantity: string;
          remaining_quantity: string;
          market_symbol: string;
          created_at: string;
          updated_at: string;
        }[]
      >`
        SELECT
          o.id::text,
          o.status,
          o.side,
          o.price::text,
          o.quantity::text,
          o.remaining_quantity::text,
          m.symbol AS market_symbol,
          o.created_at,
          o.updated_at
        FROM ex_order o
        JOIN ex_market m ON m.id = o.market_id
        WHERE o.id = ${q.id}::uuid
          AND o.user_id = ${actingUserId}::uuid
        LIMIT 1
      `;
      return rows[0] ?? null;
    });

    if (!row) return apiError("not_found");

    const ex = explain(row.status);
    return Response.json({
      ok: true,
      kind: "exchange_order",
      id: row.id,
      status: row.status,
      market: row.market_symbol,
      side: row.side,
      price: row.price,
      quantity: row.quantity,
      remaining_quantity: row.remaining_quantity,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...ex,
    });
  } catch (e) {
    const resp = responseForDbError("explain.order", e);
    if (resp) return resp;
    throw e;
  }
}
