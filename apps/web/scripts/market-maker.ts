// Market Maker Script for TradeSynapse
// Creates liquidity (Buy/Sell limit orders) for TST/USDT on the local exchange.

import { getSql } from "../src/lib/db";
import { v4 as uuidv4 } from "uuid";

// Config
const MARKET_SYMBOL = "TST/USDT";
const MID_PRICE = 1.25; // Target price for TST
const SPREAD_PCT = 0.02; // 2% spread
const ORDER_COUNT = 10; // Orders per side
const REFRESH_INTERVAL = 5000; // 5 seconds
const USER_ID_MM = "00000000-0000-0000-0000-000000000000"; // Use a fixed system/bot ID (or valid UUID)

async function main() {
  const sql = getSql();
  console.log(`🤖 Market Maker starting for ${MARKET_SYMBOL}...`);

  // 1. Ensure MM User Exists
  await sql`
    INSERT INTO app_user (id, email, password_hash, role, email_verified)
    VALUES (${USER_ID_MM}, 'mm@tradesynapse.com', 'hash', 'admin', true)
    ON CONFLICT (id) DO NOTHING
  `;

  // 2. Get Market ID
  const [market] = await sql`SELECT id FROM ex_market WHERE symbol = ${MARKET_SYMBOL}`;
  if (!market) {
    console.error(`❌ Market ${MARKET_SYMBOL} not found!`);
    process.exit(1);
  }

  // 3. Loop
  while (true) {
    try {
      console.log("Creation liquidity...");

      // Cancel old MM orders
      await sql`DELETE FROM ex_order WHERE user_id = ${USER_ID_MM}`;

      const orders = [];
      
      // Generate Bids (Buy Low)
      for (let i = 1; i <= ORDER_COUNT; i++) {
        const price = MID_PRICE * (1 - (SPREAD_PCT / 2) - (i * 0.005));
        const qty = 100 + Math.random() * 500;
        orders.push({
            market_id: market.id,
            user_id: USER_ID_MM,
            side: "buy",
            type: "limit",
            price: price.toFixed(4),
            quantity: qty.toFixed(2),
            remaining_quantity: qty.toFixed(2),
            status: "open"
        });
      }

      // Generate Asks (Sell High)
      for (let i = 1; i <= ORDER_COUNT; i++) {
        const price = MID_PRICE * (1 + (SPREAD_PCT / 2) + (i * 0.005));
        const qty = 100 + Math.random() * 500;
        orders.push({
            market_id: market.id,
            user_id: USER_ID_MM,
            side: "sell",
            type: "limit",
            price: price.toFixed(4),
            quantity: qty.toFixed(2),
            remaining_quantity: qty.toFixed(2),
            status: "open"
        });
      }

      // Batch Insert
      await sql`
        INSERT INTO ex_order ${sql(orders, "market_id", "user_id", "side", "type", "price", "quantity", "remaining_quantity", "status")}
      `;

      console.log(`✅ Placed ${orders.length} orders around $${MID_PRICE}`);

    } catch (err) {
      console.error("MM Error:", err);
    }

    await new Promise(r => setTimeout(r, REFRESH_INTERVAL));
  }
}

main();
