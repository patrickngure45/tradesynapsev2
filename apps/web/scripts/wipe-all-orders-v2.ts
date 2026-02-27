import "dotenv/config";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Add it to your .env file.");
  process.exit(1);
}

async function main() {
  const sql = postgres(DATABASE_URL);
  console.log("Cleaning up open orders on Exchange...");

  try {
    // 1. Cancel all open orders in ex_order
    const res = await sql`
      UPDATE ex_order
      SET status = 'canceled', updated_at = now()
      WHERE status IN ('open', 'partially_filled')
      RETURNING id
    `;
    console.log(`Cancelled ${res.length} orders.`);

    // 2. Also clear P2P ads
    const ads = await sql`
        UPDATE p2p_ad
        SET status = 'closed', updated_at = now()
        WHERE status = 'active'
        RETURNING id
    `;
    console.log(`Closed ${ads.length} P2P ads.`);
    
    // 3. WIPE the arbitrage snapshots
    await sql`DELETE FROM arb_price_snapshot`;
    console.log("Wiped stale arbitrage snapshots.");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await sql.end();
  }
}

main();
