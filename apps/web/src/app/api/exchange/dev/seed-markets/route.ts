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
    const usdt = find(chain, "USDT");
    const usdc = find(chain, "USDC");
    const btc = find(chain, "BTC");
    const eth = find(chain, "ETH");
    const bnb = find(chain, "BNB");

    if (!usdt || !btc || !eth || !bnb) {
      return apiError("not_found", { details: "missing_assets_seed_assets_first" });
    }

    const markets = [
      { symbol: "BTC/USDT", base: btc, quote: usdt },
      { symbol: "ETH/USDT", base: eth, quote: usdt },
      { symbol: "BNB/USDT", base: bnb, quote: usdt },
      ...(usdc
        ? [
            { symbol: "BTC/USDC", base: btc, quote: usdc },
            { symbol: "ETH/USDC", base: eth, quote: usdc },
            { symbol: "BNB/USDC", base: bnb, quote: usdc },
          ]
        : []),
    ];

    const out: Array<{
      id: string;
      chain: string;
      symbol: string;
      base_asset_id: string;
      quote_asset_id: string;
      status: string;
    }> = [];

    for (const m of markets) {
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
        VALUES (${chain}, ${m.symbol}, ${m.base}::uuid, ${m.quote}::uuid, 'enabled', 0.00000001, 0.00000001, 0, 0)
        ON CONFLICT (chain, symbol) DO UPDATE
          SET status = 'enabled', maker_fee_bps = 0, taker_fee_bps = 0
        RETURNING id, chain, symbol, base_asset_id, quote_asset_id, status
      `;
      if (rows[0]) out.push(rows[0]);
    }

    return Response.json({ ok: true, markets: out }, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("exchange.dev.seed_markets", e);
    if (resp) return resp;
    throw e;
  }
}
