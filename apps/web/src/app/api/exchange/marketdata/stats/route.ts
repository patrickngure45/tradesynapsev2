import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  market_id: z.string().uuid(),
  window_hours: z.coerce.number().int().min(1).max(168).optional().default(24),
});

type StatsRow = {
  open: string | null;
  last: string | null;
  high: string | null;
  low: string | null;
  volume: string | null;
  quote_volume: string | null;
  vwap: string | null;
  trade_count: number;
};

export async function GET(request: Request) {
  const sql = getSql();
  const url = new URL(request.url);

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      market_id: url.searchParams.get("market_id"),
      window_hours: url.searchParams.get("window_hours") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  let market: { id: string; chain: string; symbol: string; status: string } | null = null;
  let statsRows: StatsRow[] = [];

  try {
    const data = await retryOnceOnTransientDbError(async () => {
      const markets = await sql<{ id: string; chain: string; symbol: string; status: string }[]>`
        SELECT id, chain, symbol, status
        FROM ex_market
        WHERE id = ${q.market_id}::uuid
        LIMIT 1
      `;
      if (markets.length === 0) return { market: null, statsRows: [] as StatsRow[] };

      const rows = await sql<StatsRow[]>`
        WITH tr AS (
          SELECT
            id,
            created_at,
            price,
            quantity
          FROM ex_execution
          WHERE market_id = ${q.market_id}::uuid
            AND created_at >= now() - (${q.window_hours}::int * interval '1 hour')
        )
        SELECT
          (array_agg(price::text ORDER BY created_at ASC, id ASC))[1] AS open,
          (array_agg(price::text ORDER BY created_at DESC, id DESC))[1] AS last,
          max(price)::text AS high,
          min(price)::text AS low,
          sum(quantity)::text AS volume,
          sum((price * quantity))::text AS quote_volume,
          CASE
            WHEN sum(quantity) = 0 THEN NULL
            ELSE (sum((price * quantity)) / sum(quantity))::text
          END AS vwap,
          count(*)::int AS trade_count
        FROM tr
      `;

      return { market: markets[0]!, statsRows: rows };
    });

    market = data.market;
    statsRows = data.statsRows;
  } catch (e) {
    return responseForDbError("exchange.marketdata.stats", e) ?? apiError("upstream_unavailable");
  }

  if (!market) return apiError("market_not_found");

  const row = statsRows[0];
  const stats = row?.trade_count ? row : null;

  return Response.json({
    market,
    window_hours: q.window_hours,
    stats,
    ts: new Date().toISOString(),
  });
}
