import "dotenv/config";

import { getSql } from "../src/lib/db";

type AssetRow = {
  id: string;
  chain: string;
  symbol: string;
  name: string | null;
  decimals: number;
  contract_address: string | null;
  is_enabled: boolean;
  created_at: string;
};

type MarketRow = {
  id: string;
  chain: string;
  symbol: string;
  status: string;
  base_symbol: string;
  quote_symbol: string;
  created_at: string;
};

async function main() {
  const sql = getSql();

  const assets = await sql<AssetRow[]>`
    SELECT
      id::text AS id,
      chain,
      symbol,
      name,
      decimals,
      contract_address,
      is_enabled,
      created_at::text AS created_at
    FROM ex_asset
    ORDER BY chain ASC, symbol ASC
  `;

  const markets = await sql<MarketRow[]>`
    SELECT
      m.id::text AS id,
      m.chain,
      m.symbol,
      m.status,
      b.symbol AS base_symbol,
      q.symbol AS quote_symbol,
      m.created_at::text AS created_at
    FROM ex_market m
    JOIN ex_asset b ON b.id = m.base_asset_id
    JOIN ex_asset q ON q.id = m.quote_asset_id
    ORDER BY m.chain ASC, m.symbol ASC
  `;

  const enabledAssets = assets.filter((r) => r.is_enabled);
  const enabledMarkets = markets.filter((m) => (m.status ?? "").toLowerCase() === "enabled");

  console.log(
    JSON.stringify(
      {
        ok: true,
        totalAssets: assets.length,
        enabledAssets: enabledAssets.length,
        enabledAssetSymbolsByChain: enabledAssets.reduce<Record<string, string[]>>((acc, r) => {
          acc[r.chain] = acc[r.chain] ?? [];
          acc[r.chain].push(r.symbol);
          return acc;
        }, {}),
        totalMarkets: markets.length,
        enabledMarkets: enabledMarkets.length,
        enabledMarketSymbolsByChain: enabledMarkets.reduce<Record<string, string[]>>((acc, m) => {
          acc[m.chain] = acc[m.chain] ?? [];
          acc[m.chain].push(m.symbol);
          return acc;
        }, {}),
        assets,
        markets,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
