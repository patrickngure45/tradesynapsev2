/// <reference types="node" />

import "dotenv/config";

import { getSql } from "../src/lib/db";

async function main() {
  const chain = (process.env.CHAIN ?? "bsc").trim();
  const symbol = (process.env.SYMBOL ?? "").trim().toUpperCase();
  if (!symbol) throw new Error("Set SYMBOL=<ASSET_SYMBOL>");

  const sql = getSql();
  const rows = await sql<{ updated: number }[]>`
    UPDATE ex_asset
    SET is_enabled = true
    WHERE chain = ${chain}
      AND upper(symbol) = ${symbol}
    RETURNING 1
  `;

  console.log(JSON.stringify({ chain, symbol, updated: rows.length }, null, 2));
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
