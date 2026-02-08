
import { getSql } from "../apps/web/src/lib/db";

async function main() {
  const sql = getSql();
  const orders = await sql`SELECT * FROM ex_order`;
  console.log(`Found ${orders.length} spot orders.`);
  
  const p2pOrders = await sql`SELECT * FROM p2p_order`;
  console.log(`Found ${p2pOrders.length} P2P orders.`);
  
  await sql.end();
}

main().catch(console.error);
