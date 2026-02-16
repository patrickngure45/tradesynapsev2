import "dotenv/config";
import { getSql } from "../src/lib/db";
async function main() {
  const sql = getSql();
  const rows = await sql`SELECT id::text, symbol, contract_address, decimals FROM ex_asset WHERE chain = 'bsc'`;
  console.table(rows);
  process.exit(0);
}
main();
