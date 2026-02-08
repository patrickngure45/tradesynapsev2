import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  market_id: z.string().uuid(),
  levels: z.coerce.number().int().min(1).max(50).optional().default(10),
});

export async function GET(request: Request) {
  const sql = getSql();
  const url = new URL(request.url);

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      market_id: url.searchParams.get("market_id"),
      levels: url.searchParams.get("levels") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  let market: { id: string; chain: string; symbol: string; status: string } | null = null;
  let bids: { price: string; quantity: string; order_count: number }[] = [];
  let asks: { price: string; quantity: string; order_count: number }[] = [];

  try {
    const data = await retryOnceOnTransientDbError(async () => {
      const markets = await sql<{ id: string; chain: string; symbol: string; status: string }[]>`
        SELECT id, chain, symbol, status
        FROM ex_market
        WHERE id = ${q.market_id}::uuid
        LIMIT 1
      `;
      if (markets.length === 0) return { market: null, bids: [], asks: [] };

      const [bidsRows, asksRows] = await Promise.all([
        sql<{ price: string; quantity: string; order_count: number }[]>`
          SELECT
            price::text AS price,
            sum(remaining_quantity)::text AS quantity,
            count(*)::int AS order_count
          FROM ex_order
          WHERE market_id = ${q.market_id}::uuid
            AND side = 'buy'
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
          GROUP BY price
          ORDER BY price DESC
          LIMIT ${q.levels}
        `,
        sql<{ price: string; quantity: string; order_count: number }[]>`
          SELECT
            price::text AS price,
            sum(remaining_quantity)::text AS quantity,
            count(*)::int AS order_count
          FROM ex_order
          WHERE market_id = ${q.market_id}::uuid
            AND side = 'sell'
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
          GROUP BY price
          ORDER BY price ASC
          LIMIT ${q.levels}
        `,
      ]);

      return { market: markets[0]!, bids: bidsRows, asks: asksRows };
    });

    market = data.market;
    bids = data.bids;
    asks = data.asks;
  } catch (e) {
    return responseForDbError("exchange.marketdata.depth", e) ?? apiError("upstream_unavailable");
  }

  if (!market) return apiError("market_not_found");

  return Response.json({
    market,
    depth: { bids, asks },
    levels: q.levels,
    ts: new Date().toISOString(),
  });
}
