import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getSql();

  try {
    const rows = await retryOnceOnTransientDbError(async () => {
      // Fetch 24h stats for all active markets
      return await sql<{
        market_id: string;
        symbol: string;
        open: string | null;
        last: string | null;
        high: string | null;
        low: string | null;
        volume: string | null;
        quote_volume: string | null;
        trade_count: number;
      }[]>`
        WITH stats AS (
          SELECT
            market_id,
            (array_agg(price ORDER BY created_at ASC, id ASC))[1] as open,
            (array_agg(price ORDER BY created_at DESC, id DESC))[1] as last,
            MAX(price) as high,
            MIN(price) as low,
            SUM(quantity) as volume,
            SUM(price * quantity) as quote_volume,
            COUNT(*) as trade_count
          FROM ex_execution
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY market_id
        )
        SELECT
          m.id as market_id,
          m.symbol,
          s.open::text,
          s.last::text,
          s.high::text,
          s.low::text,
          COALESCE(s.volume, 0)::text as volume,
          COALESCE(s.quote_volume, 0)::text as quote_volume,
          COALESCE(s.trade_count, 0)::int as trade_count
        FROM ex_market m
        LEFT JOIN stats s ON s.market_id = m.id
        WHERE m.status IN ('enabled')
      `;
    });
    
    return Response.json({ tickers: rows });

  } catch(e) {
    return responseForDbError("exchange.tickers", e) ?? apiError("upstream_unavailable");
  }
}
