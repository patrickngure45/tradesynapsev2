import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  market_id: z.string().uuid(),
  interval: z.literal("1m").optional().default("1m"),
  limit: z.coerce.number().int().min(1).max(500).optional().default(60),
});

type CandleRow = {
  ts: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trade_count: number;
};

export async function GET(request: Request) {
  const sql = getSql();
  const url = new URL(request.url);

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      market_id: url.searchParams.get("market_id"),
      interval: url.searchParams.get("interval") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  let market: { id: string; chain: string; symbol: string; status: string } | null = null;

  try {
    const data = await retryOnceOnTransientDbError(async () => {
      const markets = await sql<{ id: string; chain: string; symbol: string; status: string }[]>`
        SELECT id, chain, symbol, status
        FROM ex_market
        WHERE id = ${q.market_id}::uuid
        LIMIT 1
      `;
      return { market: markets[0] ?? null };
    });
    market = data.market;
  } catch (e) {
    return responseForDbError("exchange.marketdata.candles.market", e) ?? apiError("upstream_unavailable");
  }

  if (!market) return apiError("market_not_found");

  // Only 1m interval for now; keep this explicit so future intervals can
  // be added without silent behavior changes.
  if (q.interval !== "1m") return apiError("invalid_input", { details: { interval: q.interval } });

  const lookbackMinutes = q.limit + 5;

  let rows: CandleRow[] = [];
  try {
    rows = await retryOnceOnTransientDbError(async () => {
      return await sql<CandleRow[]>`
        WITH tr AS (
          SELECT
            id,
            created_at,
            price,
            quantity,
            date_trunc('minute', created_at AT TIME ZONE 'UTC') AS bucket_utc
          FROM ex_execution
          WHERE market_id = ${q.market_id}::uuid
            AND created_at >= now() - (${lookbackMinutes}::int * interval '1 minute')
        )
        SELECT
          to_char(bucket_utc, 'YYYY-MM-DD"T"HH24:MI:00"Z"') AS ts,
          (array_agg(price::text ORDER BY created_at ASC, id ASC))[1] AS open,
          max(price)::text AS high,
          min(price)::text AS low,
          (array_agg(price::text ORDER BY created_at DESC, id DESC))[1] AS close,
          sum(quantity)::text AS volume,
          count(*)::int AS trade_count
        FROM tr
        GROUP BY bucket_utc
        ORDER BY bucket_utc DESC
        LIMIT ${q.limit}
      `;
    });
  } catch (e) {
    return responseForDbError("exchange.marketdata.candles", e) ?? apiError("upstream_unavailable");
  }

  const candles = rows.slice().reverse();

  return Response.json({ market, interval: q.interval, candles });
}
