
import { createSql } from "../src/lib/db";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Provide it via environment variables.");
}

async function main() {
  const sql = createSql();
  try {
    const orders = await sql`
      SELECT id, status, created_at, maker_id, taker_id 
      FROM p2p_order 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    console.log("Recent Orders:");
    console.table(orders);
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
