import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const marketIdSchema = z.string().uuid();

export async function GET(request: Request) {
  const sql = getSql();
  const url = new URL(request.url);
  const marketId = url.searchParams.get("market_id") ?? "";

  try {
    marketIdSchema.parse(marketId);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  let market: { id: string; chain: string; symbol: string; status: string } | null = null;
  let bid: { price: string; quantity: string; order_count: number } | null = null;
  let ask: { price: string; quantity: string; order_count: number } | null = null;

  try {
    const data = await retryOnceOnTransientDbError(async () => {
      const markets = await sql<{ id: string; chain: string; symbol: string; status: string }[]>`
        SELECT id, chain, symbol, status
        FROM ex_market
        WHERE id = ${marketId}::uuid
        LIMIT 1
      `;

      if (markets.length === 0) return { market: null, bid: null, ask: null };

      const [bidRows, askRows] = await Promise.all([
        sql<{ price: string; quantity: string; order_count: number }[]>`
          SELECT
            price::text AS price,
            sum(remaining_quantity)::text AS quantity,
            count(*)::int AS order_count
          FROM ex_order
          WHERE market_id = ${marketId}::uuid
            AND side = 'buy'
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
          GROUP BY price
          ORDER BY price DESC
          LIMIT 1
        `,
        sql<{ price: string; quantity: string; order_count: number }[]>`
          SELECT
            price::text AS price,
            sum(remaining_quantity)::text AS quantity,
            count(*)::int AS order_count
          FROM ex_order
          WHERE market_id = ${marketId}::uuid
            AND side = 'sell'
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
          GROUP BY price
          ORDER BY price ASC
          LIMIT 1
        `,
      ]);

      return {
        market: markets[0]!,
        bid: bidRows[0] ?? null,
        ask: askRows[0] ?? null,
      };
    });

    market = data.market;
    bid = data.bid;
    ask = data.ask;
  } catch (e) {
    return responseForDbError("exchange.marketdata.top", e) ?? apiError("upstream_unavailable");
  }

  if (!market) return apiError("market_not_found");

  return Response.json({
    market,
    top: {
      bid,
      ask,
    },
    ts: new Date().toISOString(),
  });
}
