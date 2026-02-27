
import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();
  const email = "ngurengure10@gmail.com"; 

  const rows = await sql`
    SELECT a.symbol, acct.balance
    FROM ex_ledger_account acct
    JOIN ex_asset a ON a.id = acct.asset_id
    JOIN app_user u ON u.id = acct.user_id
    WHERE u.email = ${email}
  `;
  
  console.table(rows);
  process.exit(0);
}
main();
