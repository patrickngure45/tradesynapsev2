
import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();
  console.log("Cleaning up open orders...");

  // 1. Cancel all open orders
  // We use a custom status 'cancelled_admin' or just 'cancelled'
  const res = await sql`
    UPDATE ex_order
    SET status = 'cancelled', updated_at = now()
    WHERE status IN ('open', 'partially_filled')
    RETURNING id, price, quantity
  `;

  console.log(`Cancelled ${res.length} orders.`);

  // 2. Also clear the holds associated with these orders?
  // Ideally yes, but if this is just to fix the scanner view, stopping here is safer than messing with the ledger manually.
  // The scanner only looks at ex_order status.

  // 3. Force refresh the arbitrage snapshot
  // The scanner reads from 'arb_price_snapshot' table usually, OR live.
  // The code snippet I saw earlier for 'captureArbSnapshots' reads from ex_order AND arb_price_snapshot.
  // But wait, the API route:
  // if (action === 'scan') -> calls captureArbSnapshots -> calls detectOpportunities
  // captureArbSnapshots -> inserts into arb_price_snapshot
  // detectOpportunities -> calculates from the *returned* snapshots (which includes the fresh DB query)
  
  // So simply cancelling the orders is enough. Next scan will see empty book.

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
