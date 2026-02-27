import "dotenv/config";

import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();

  const email = process.env.EMAIL ?? "ngurengure10@gmail.com";
  const symbol = (process.env.SYMBOL ?? "USDT").toUpperCase();

  const rows = await sql<
    {
      symbol: string;
      posted: string;
    }[]
  >`
    SELECT a.symbol, coalesce(sum(jl.amount), 0)::text AS posted
    FROM ex_journal_line jl
    JOIN ex_ledger_account la ON la.id = jl.account_id
    JOIN app_user u ON u.id = la.user_id
    JOIN ex_asset a ON a.id = jl.asset_id
    WHERE u.email = ${email}
      AND a.symbol = ${symbol}
    GROUP BY a.symbol
  `;

  const row = rows[0] ?? { symbol, posted: "0" };
  console.log(JSON.stringify({ email, symbol: row.symbol, posted: row.posted }, null, 2));
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
