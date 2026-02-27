
import "dotenv/config";
import { createSql } from "../src/lib/db";

async function main() {
  const sql = createSql();
  console.log("Checking ex_ledger_account columns...");
  
  const columns = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'ex_ledger_account';
  `;

  console.log("Columns:", columns);
  await sql.end();
}

main().catch(console.error);
