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
          kind: "flexible" | "locked";
          lock_days: number | null;
          apr_bps: number;
          status: "enabled" | "disabled";
          asset_id: string;
          asset_symbol: string;
          asset_name: string | null;
          asset_decimals: number;
        }[]
      >`
        SELECT
          p.id::text AS id,
          p.chain,
          p.kind,
          p.lock_days,
          p.apr_bps,
          p.status,
          a.id::text AS asset_id,
          a.symbol AS asset_symbol,
          a.name AS asset_name,
          a.decimals AS asset_decimals
        FROM earn_product p
        JOIN ex_asset a ON a.id = p.asset_id
        WHERE p.status = 'enabled'
        ORDER BY a.symbol ASC, p.kind ASC, p.lock_days ASC NULLS FIRST
      `;
    });

    return Response.json({ ok: true, products: rows }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("earn.products.list", e);
    if (resp) return resp;
    throw e;
  }
}
