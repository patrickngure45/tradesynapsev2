
import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();
  console.log("🌱 Seeding Production Assets & Markets...");

  try {
    const chain = "bsc";

    // 1. Assets
    const assets = [
      { symbol: "BNB", name: "BNB", contract: null, decimals: 18 },
      { symbol: "USDT", name: "Tether USD", contract: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
      { symbol: "BTC", name: "Bitcoin", contract: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 },
      { symbol: "ETH", name: "Ethereum", contract: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18 },
    ];

    for (const a of assets) {
      await sql`
        INSERT INTO ex_asset (chain, symbol, name, contract_address, decimals, is_enabled)
        VALUES (${chain}, ${a.symbol}, ${a.name}, ${a.contract}, ${a.decimals}, true)
        ON CONFLICT (chain, symbol) DO NOTHING
      `;
      console.log(`✅ Asset: ${a.symbol}`);
    }

    // 2. Markets
    const [usdt] = await sql`SELECT id FROM ex_asset WHERE chain = ${chain} AND symbol = 'USDT'`;
    const [btc] = await sql`SELECT id FROM ex_asset WHERE chain = ${chain} AND symbol = 'BTC'`;
    const [eth] = await sql`SELECT id FROM ex_asset WHERE chain = ${chain} AND symbol = 'ETH'`;
    const [bnb] = await sql`SELECT id FROM ex_asset WHERE chain = ${chain} AND symbol = 'BNB'`;

    const markets = [
      { base: btc.id, quote: usdt.id, symbol: "BTC/USDT" },
      { base: eth.id, quote: usdt.id, symbol: "ETH/USDT" },
      { base: bnb.id, quote: usdt.id, symbol: "BNB/USDT" },
    ];

    for (const m of markets) {
       await sql`
          INSERT INTO ex_market (id, chain, base_asset_id, quote_asset_id, symbol, status)
          VALUES (gen_random_uuid(), ${chain}, ${m.base}, ${m.quote}, ${m.symbol}, 'enabled')
          ON CONFLICT (chain, symbol) DO NOTHING
       `;
       console.log(`✅ Market: ${m.symbol}`);
    }

    console.log("🎉 Production Seed Complete!");

  } catch (err) {
    console.error("❌ Seed Failed:", err);
    process.exit(1);
  }
  process.exit(0);
}

main();
