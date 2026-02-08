
import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();
  console.log("🤖 Starting Market Maker Simulation...");

  try {
        // 1. Ensure Market Maker User Exists (no password auth required)
        const email = "marketmaker@system.local";

        await sql`
            INSERT INTO app_user (email, status, kyc_level, role, display_name)
            VALUES (${email}, 'active', 'full', 'user', 'Market Maker')
            ON CONFLICT (email) DO NOTHING
        `;

        const [user] = await sql`SELECT id FROM app_user WHERE email = ${email} LIMIT 1`;
        console.log(`👤 Market Maker User: ${user.id}`);

    // 2. Fund the Account (USDT & TST)
    const [usdt] = await sql`SELECT id FROM ex_asset WHERE symbol = 'USDT'`;
    const [tst] = await sql`SELECT id FROM ex_asset WHERE symbol = 'TST'`;

    await fundUser(sql, user.id, usdt.id, 1000000); // 1M USDT
    await fundUser(sql, user.id, tst.id, 1000000); // 1M TST

    // 3. Place Orders (TST/USDT currently at $0)
    // We will set the price around $1.50
    const [market] = await sql`SELECT id FROM ex_market WHERE symbol = 'TST/USDT'`;
    
    // Check if orders exist to avoid duplication on restart
    const [existingCount] = await sql`SELECT count(*) as count FROM ex_order WHERE market_id = ${market.id}`;
    
    if (parseInt(existingCount.count) > 0) {
        console.log("✅ Market already active (orders found). Skipping initialization.");
    } else {
        console.log("📈 Placing Orders...");
        const orders = [
            // Sells (Asks) - People selling TST for USDT
            { side: 'sell', price: 1.55, quantity: 1000 },
            { side: 'sell', price: 1.52, quantity: 5000 },
            { side: 'sell', price: 1.51, quantity: 2000 },
            
            // Buys (Bids) - People buying TST with USDT
            { side: 'buy', price: 1.49, quantity: 2500 },
            { side: 'buy', price: 1.48, quantity: 6000 },
            { side: 'buy', price: 1.45, quantity: 10000 },
        ];

        for (const o of orders) {
            await sql`
                INSERT INTO ex_order (
                    id, market_id, user_id, side, type, price, quantity, remaining_quantity, status
                ) VALUES (
                    gen_random_uuid(), ${market.id}, ${user.id}, ${o.side}, 'limit', 
                    ${o.price}, ${o.quantity}, ${o.quantity}, 'open'
                )
            `;
        }
        
        // 4. Create a Fake Trade (to set the current price)
        // A trade happens when a buy matches a sell. We'll simulate one at $1.50
        await sql`
            INSERT INTO ex_execution (
                id, market_id, side, price, quantity, 
                maker_order_id, taker_order_id, created_at
            ) VALUES (
                gen_random_uuid(), ${market.id}, 'buy', 1.50, 500,
                gen_random_uuid(), gen_random_uuid(), now()
            )
        `;
    
        console.log("✅ Market Maker Activity Injected.");
    }

    console.log("✅ Market Maker Active. Order book populated.");

  } catch (err) {
    console.error("❌ MM Failed:", err);
  }
  process.exit(0);
}

async function fundUser(sql: any, userId: string, assetId: string, amount: number) {
    // Check if account exists
    const [existing] = await sql`
        SELECT id FROM ex_ledger_account WHERE user_id = ${userId} AND asset_id = ${assetId}
    `;
    
    if (!existing) {
        await sql`
            INSERT INTO ex_ledger_account (id, user_id, asset_id, balance, locked, status)
            VALUES (gen_random_uuid(), ${userId}, ${assetId}, ${amount}, 0, 'active')
        `;
    } else {
        await sql`
            UPDATE ex_ledger_account SET balance = ${amount} WHERE id = ${existing.id}
        `;
    }
}

main();
