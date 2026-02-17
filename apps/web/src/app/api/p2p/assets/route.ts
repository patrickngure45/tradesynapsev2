import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getSql();
  try {
    const assets = await sql<{ symbol: string }[]>`
      SELECT symbol
      FROM ex_asset
      WHERE chain = 'bsc'
        AND is_enabled = true
      ORDER BY (symbol = 'USDT') DESC, symbol ASC
    `;

    return Response.json({ ok: true, assets: assets.map((a) => a.symbol) }, { status: 200 });
  } catch (e: any) {
    return apiError(e?.message || "internal_error", { details: e });
  }
}
