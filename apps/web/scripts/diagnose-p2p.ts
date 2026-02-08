
import { createSql } from "../src/lib/db";

async function main() {
  const sql = createSql();

  try {
    console.log("--- DIAGONSTICS START ---");

    // 1. Check Mock Taker
    const [mockTaker] = await sql`SELECT id, email FROM app_user WHERE email = 'taker@demo.com'`;
    console.log("Mock Taker:", mockTaker || "NOT FOUND");

    // 2. Check Ads
    const ads = await sql`SELECT id, user_id, side, asset_id, status, remaining_amount FROM p2p_ad`;
    console.log(`Found ${ads.length} Ads.`);

    for (const ad of ads) {
        const [asset] = await sql`SELECT symbol FROM ex_asset WHERE id = ${ad.asset_id}`;
        const symbol = asset?.symbol || "???";
        
        console.log(`Ad ${ad.id.slice(0,8)}...: ${ad.side} ${symbol} (User: ${ad.user_id.slice(0,8)}...) [${ad.status}]`);
        console.log(`   Remaining: ${ad.remaining_amount}`);


        // Check Balances for relevant parties
        // Maker
        const [makerBalance] = await sql`SELECT balance FROM ex_ledger_account WHERE user_id = ${ad.user_id} AND asset_id = ${ad.asset_id}`;
        console.log(`   Maker Balance (${symbol}): ${makerBalance?.balance || 0}`);

        if (mockTaker) {
             const [takerBalance] = await sql`SELECT balance FROM ex_ledger_account WHERE user_id = ${mockTaker.id} AND asset_id = ${ad.asset_id}`;
             console.log(`   MockTaker Balance (${symbol}): ${takerBalance?.balance || 0}`);
        }
    }
    
    // 3. Check locks (optional, might need permissions)
    try {
        const locks = await sql`
            SELECT count(*) as lock_count FROM pg_locks WHERE granted = false
        `;
        console.log("Pending Locks:", locks[0].lock_count);
    } catch (e) {
        console.log("Could not query pg_locks:", (e as any).message);
    }

  } catch (err) {
    console.error("Diagnosis Error:", err);
  } finally {
    await sql.end();
    console.log("--- DIAGONSTICS END ---");
  }
}

main();
