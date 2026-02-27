
import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();
  const cols = await sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'ex_ledger_account'
  `;
  console.log("ex_ledger_account columns:", cols.map(c => c.column_name));
  
  const jCols = await sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'ex_journal_line'
  `;
  console.log("ex_journal_line columns:", jCols.map(c => c.column_name));
  
  process.exit(0);
}
main();
