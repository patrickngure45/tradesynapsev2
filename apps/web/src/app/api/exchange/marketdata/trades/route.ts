import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  market_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export async function GET(request: Request) {
  const sql = getSql();
  const url = new URL(request.url);

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      market_id: url.searchParams.get("market_id"),
      limit: url.searchParams.get("limit") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  let market: { id: string; chain: string; symbol: string; status: string } | null = null;
  let trades: Array<{
    id: string;
    price: string;
    quantity: string;
    maker_order_id: string;
    taker_order_id: string;
    created_at: string;
  }> = [];

  try {
    const data = await retryOnceOnTransientDbError(async () => {
      const markets = await sql<{ id: string; chain: string; symbol: string; status: string }[]>`
        SELECT id, chain, symbol, status
        FROM ex_market
        WHERE id = ${q.market_id}::uuid
        LIMIT 1
      `;
      if (markets.length === 0) return { market: null, trades: [] };

      const rows = await sql<
        {
          id: string;
          price: string;
          quantity: string;
          maker_order_id: string;
          taker_order_id: string;
          created_at: string;
        }[]
      >`
        SELECT
          id,
          price::text AS price,
          quantity::text AS quantity,
          maker_order_id,
          taker_order_id,
          created_at
        FROM ex_execution
        WHERE market_id = ${q.market_id}::uuid
        ORDER BY created_at DESC
        LIMIT ${q.limit}
      `;

      return { market: markets[0]!, trades: rows };
    });

    market = data.market;
    trades = data.trades;
  } catch (e) {
    return responseForDbError("exchange.marketdata.trades", e) ?? apiError("upstream_unavailable");
  }

  if (!market) return apiError("market_not_found");

  return Response.json({ market, trades });
}
