import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getSql();

  try {
    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          chain: string;
          symbol: string;
          base_asset_id: string;
          quote_asset_id: string;
          status: string;
          tick_size: string;
          lot_size: string;
          maker_fee_bps: number;
          taker_fee_bps: number;
          created_at: string;
        }[]
      >`
        SELECT
          id,
          chain,
          symbol,
          base_asset_id,
          quote_asset_id,
          status,
          tick_size::text AS tick_size,
          lot_size::text AS lot_size,
          maker_fee_bps,
          taker_fee_bps,
          created_at
        FROM ex_market
        WHERE status = 'enabled'
        ORDER BY chain ASC, symbol ASC
      `;
    });

    return Response.json({ markets: rows });
  } catch (e) {
    const resp = responseForDbError("exchange.markets.list", e);
    if (resp) return resp;
    throw e;
  }
}
