import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") return apiError("not_found");

  const sql = getSql();

  try {
    const assets = await sql<{ id: string; chain: string; symbol: string }[]>`
      SELECT id, chain, symbol
      FROM ex_asset
      WHERE is_enabled = true
    `;

    const find = (chain: string, symbol: string) =>
      assets.find((a) => a.chain === chain && a.symbol === symbol)?.id ?? null;

    const chain = "bsc";
    const base = find(chain, "TST");
    const quote = find(chain, "USDT");
    if (!base || !quote) return apiError("not_found", { details: "missing_assets_seed_assets_first" });

    const symbol = "TST/USDT";

    const rows = await sql<
      {
        id: string;
        chain: string;
        symbol: string;
        base_asset_id: string;
        quote_asset_id: string;
        status: string;
      }[]
    >`
      INSERT INTO ex_market (chain, symbol, base_asset_id, quote_asset_id, status, tick_size, lot_size, maker_fee_bps, taker_fee_bps)
      VALUES (${chain}, ${symbol}, ${base}::uuid, ${quote}::uuid, 'enabled', 0.00000001, 0.00000001, 0, 0)
      ON CONFLICT (chain, symbol) DO UPDATE
        SET status = 'enabled', maker_fee_bps = 0, taker_fee_bps = 0
      RETURNING id, chain, symbol, base_asset_id, quote_asset_id, status
    `;

    return Response.json({ ok: true, market: rows[0] }, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("exchange.dev.seed_markets", e);
    if (resp) return resp;
    throw e;
  }
}
