import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getSql();

  try {
    const assets = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          chain: string;
          symbol: string;
          name: string | null;
          contract_address: string | null;
          decimals: number;
          is_enabled: boolean;
          created_at: string;
        }[]
      >`
        SELECT id, chain, symbol, name, contract_address, decimals, is_enabled, created_at
        FROM ex_asset
        WHERE is_enabled = true
        ORDER BY chain ASC, symbol ASC
      `;
    });

    return Response.json({ assets });
  } catch (e) {
    const resp = responseForDbError("exchange.assets.list", e);
    if (resp) return resp;
    throw e;
  }
}
