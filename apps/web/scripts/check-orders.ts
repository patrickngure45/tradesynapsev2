
import { createSql } from "../src/lib/db";

// Force Env for script (dev convenience)
process.env.DATABASE_URL = "postgres://neondb_owner:npg_p0TuSbgYi3rv@ep-shiny-math-ahymkfdk-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

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
