// List Supported Assets & Markets
// Queries the database to show exactly what is configured in the system.

import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();

  try {
    console.log("🔍 Scanning Database for Supported Assets...");
    
    // 1. Assets
    const assets = await sql`
      SELECT chain, symbol, name, contract_address, is_enabled 
      FROM ex_asset 
      ORDER BY chain, symbol
    `;

    if (assets.length === 0) {
        console.log("⚠️ No assets found in 'ex_asset' table.");
    } else {
        console.table(assets.map(a => ({
            Chain: a.chain,
            Symbol: a.symbol,
            Name: a.name || '-',
            Contract: a.contract_address ? `${a.contract_address.substring(0,6)}...` : 'Native',
            Enabled: a.is_enabled
        })));
    }

    console.log("\n🔍 Scanning Database for Markets...");

    // 2. Markets
    const markets = await sql`
      SELECT m.chain, m.symbol, m.status, 
             b.symbol as base, q.symbol as quote
      FROM ex_market m
      JOIN ex_asset b ON m.base_asset_id = b.id
      JOIN ex_asset q ON m.quote_asset_id = q.id
      ORDER BY m.symbol
    `;

    if (markets.length === 0) {
        console.log("⚠️ No markets found in 'ex_market' table.");
    } else {
        console.table(markets.map(m => ({
            Symbol: m.symbol,
            Base: m.base,
            Quote: m.quote,
            Status: m.status
        })));
    }

  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

main();
