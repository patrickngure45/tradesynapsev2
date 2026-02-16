import "dotenv/config";

import { getSql } from "../src/lib/db";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
const CAP_USER_ID = "00000000-0000-0000-0000-000000000002";
const BURN_USER_ID = "00000000-0000-0000-0000-000000000003";

async function main() {
  const sql = getSql();

  const rows = await sql<
    {
      bucket: string;
      chain: string;
      symbol: string;
      posted: string;
      held: string;
      available: string;
    }[]
  >`
    WITH accounts AS (
      SELECT
        la.id AS account_id,
        la.user_id,
        asset.chain,
        asset.symbol
      FROM ex_ledger_account la
      JOIN ex_asset asset ON asset.id = la.asset_id
      WHERE asset.is_enabled = true
    ),
    posted AS (
      SELECT account_id, coalesce(sum(amount), 0)::numeric AS posted
      FROM ex_journal_line
      GROUP BY account_id
    ),
    held AS (
      SELECT account_id, coalesce(sum(remaining_amount), 0)::numeric AS held
      FROM ex_hold
      WHERE status = 'active'
      GROUP BY account_id
    ),
    account_bal AS (
      SELECT
        a.user_id,
        a.chain,
        a.symbol,
        coalesce(p.posted, 0)::numeric AS posted,
        coalesce(h.held, 0)::numeric AS held,
        (coalesce(p.posted, 0)::numeric - coalesce(h.held, 0)::numeric) AS available
      FROM accounts a
      LEFT JOIN posted p ON p.account_id = a.account_id
      LEFT JOIN held h ON h.account_id = a.account_id
    )
    SELECT
      CASE
        WHEN user_id = ${SYSTEM_USER_ID}::uuid THEN 'system'
        WHEN user_id = ${CAP_USER_ID}::uuid THEN 'cap'
        WHEN user_id = ${BURN_USER_ID}::uuid THEN 'burn'
        ELSE 'users'
      END AS bucket,
      chain,
      symbol,
      sum(posted)::text AS posted,
      sum(held)::text AS held,
      sum(available)::text AS available
    FROM account_bal
    GROUP BY 1,2,3
    ORDER BY chain ASC, symbol ASC, bucket ASC
  `;

  console.log("=== Off-chain ledger balances by bucket ===");
  console.table(rows);
}

main().catch((error) => {
  console.error("[report-offchain-ledger-balances] failed:", error);
  process.exit(1);
});
