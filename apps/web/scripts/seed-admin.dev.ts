// SEED ADMIN SCRIPT
// Deposite capital into the admin account to enable testing.

import { getSql } from "../src/lib/db";
import { randomUUID } from "crypto";

async function main() {
  const sql = getSql();
  const email = "ngurengure10@gmail.com"; 
  const mintEmail = "mint@system.local";

  try {
    const [user] = await sql`SELECT id FROM app_user WHERE email = ${email}`;
    if (!user) {
      console.error(`User ${email} not found.`);
      process.exit(1);
    }
    const userId = user.id;
    console.log(`Found Admin User: ${userId}`);

    // Ensure Mint User
    let [mintUser] = await sql`SELECT id FROM app_user WHERE email = ${mintEmail}`;
    if (!mintUser) {
        console.log("Creating Mint User...");
        [mintUser] = await sql`
            INSERT INTO app_user (email, status, kyc_level)
            VALUES (${mintEmail}, 'active', 'full')
            RETURNING id
        `;
    }
    const mintUserId = mintUser.id;
    console.log(`Found Mint User: ${mintUserId}`);


    // Assets to seed
    const assetCodes = ["USDT", "BTC", "ETH", "TST"];
    const assetsMap = new Map();
    
    // Get Asset IDs
    const assetRows = await sql`
        SELECT id, symbol FROM ex_asset WHERE symbol = ANY(${assetCodes}) AND chain = 'bsc'
    `;
    
    for (const r of assetRows) {
        assetsMap.set(r.symbol, r.id);
    }

    const deposits = [
      { code: "USDT", amount: 100000.00 },
      { code: "BTC", amount: 5.00 },
      { code: "ETH", amount: 50.00 },
      { code: "TST", amount: 1000000.00 },
    ];

    await sql.begin(async (tx) => {
      const entryId = randomUUID();
      
      // Create Journal Entry
      await tx`
        INSERT INTO ex_journal_entry (id, type, created_at)
        VALUES (${entryId}, 'deposit', now())
      `;

      for (const d of deposits) {
        const assetId = assetsMap.get(d.code);
        if (!assetId) {
            console.warn(`Skipping ${d.code} - Asset ID not found`);
            continue;
        }

        // --- ADMIN ACCOUNT ---
        await tx`
          INSERT INTO ex_ledger_account (id, user_id, asset_id, balance, locked, status)
          VALUES (gen_random_uuid(), ${userId}, ${assetId}, 0, 0, 'active')
          ON CONFLICT (user_id, asset_id) DO NOTHING
        `;
        const [adminAccount] = await tx`
          SELECT id FROM ex_ledger_account WHERE user_id = ${userId} AND asset_id = ${assetId}
        `;

        // --- MINT ACCOUNT ---
        await tx`
          INSERT INTO ex_ledger_account (id, user_id, asset_id, balance, locked, status)
          VALUES (gen_random_uuid(), ${mintUserId}, ${assetId}, 0, 0, 'active')
          ON CONFLICT (user_id, asset_id) DO NOTHING
        `;
        const [mintAccount] = await tx`
          SELECT id FROM ex_ledger_account WHERE user_id = ${mintUserId} AND asset_id = ${assetId}
        `;


        // Create Journal Lines (Must sum to 0)
        // Credit Admin
        await tx`
          INSERT INTO ex_journal_line (id, entry_id, account_id, asset_id, amount)
          VALUES (gen_random_uuid(), ${entryId}, ${adminAccount.id}, ${assetId}, ${d.amount})
        `;
        // Debit Mint
        await tx`
          INSERT INTO ex_journal_line (id, entry_id, account_id, asset_id, amount)
          VALUES (gen_random_uuid(), ${entryId}, ${mintAccount.id}, ${assetId}, ${-d.amount})
        `;

        // Update Balances
        await tx`
          UPDATE ex_ledger_account
          SET balance = balance + ${d.amount}
          WHERE id = ${adminAccount.id}
        `;
        await tx`
          UPDATE ex_ledger_account
          SET balance = balance - ${d.amount}
          WHERE id = ${mintAccount.id}
        `;
        
        console.log(`✅ Deposited ${d.amount} ${d.code}`);
      }
    });

    console.log("Admin Seeded Successfully.");

  } catch (err) {
    console.error("Seed Failed:", err);
  }
  process.exit(0);
}

main();
