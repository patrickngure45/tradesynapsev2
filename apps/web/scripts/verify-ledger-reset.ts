/// <reference types="node" />

import "dotenv/config";

import { getSql } from "../src/lib/db";

const SYSTEM_IDS = new Set([
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
]);

async function main() {
  const sql = getSql();

  const enabledAssets = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c
    FROM ex_asset
    WHERE chain = 'bsc' AND is_enabled = true
  `;

  const enabledMarkets = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c
    FROM ex_market
    WHERE chain = 'bsc' AND status = 'enabled'
  `;

  const adminRows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM app_user
    WHERE lower(email) = lower('ngurengure10@gmail.com')
    LIMIT 1
  `;
  const adminId = adminRows[0]?.id ?? null;

  const nonAdminNonSystemWithNonZero = adminId
    ? await sql<{ c: number }[]>`
        WITH posted AS (
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
        accts AS (
          SELECT la.id AS account_id, la.user_id
          FROM ex_ledger_account la
          JOIN ex_asset a ON a.id = la.asset_id
          WHERE a.chain = 'bsc'
        )
        SELECT count(DISTINCT x.user_id)::int AS c
        FROM (
          SELECT
            accts.user_id,
            (coalesce(posted.posted, 0) - coalesce(held.held, 0)) AS avail
          FROM accts
          LEFT JOIN posted ON posted.account_id = accts.account_id
          LEFT JOIN held ON held.account_id = accts.account_id
        ) x
        WHERE x.avail <> 0
          AND x.user_id <> ${adminId}::uuid
          AND x.user_id::text NOT IN (
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000003'
          )
      `
    : [{ c: -1 }];

  console.log(
    JSON.stringify(
      {
        enabledAssets: enabledAssets[0]?.c ?? null,
        enabledMarkets: enabledMarkets[0]?.c ?? null,
        adminIdPresent: Boolean(adminId),
        nonAdminNonSystemUsersWithNonZeroBalance: nonAdminNonSystemWithNonZero[0]?.c ?? null,
      },
      null,
      2,
    ),
  );

  await sql.end();
}

main().catch((err) => {
  console.error("[verify-ledger-reset] failed:", err);
  process.exit(1);
});
