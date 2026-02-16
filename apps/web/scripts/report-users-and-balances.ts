import "dotenv/config";
import { getSql } from "../src/lib/db";

const SYSTEM_USER_IDS = new Set([
  "00000000-0000-0000-0000-000000000001", // treasury/settlement
  "00000000-0000-0000-0000-000000000002", // cap/equity
  "00000000-0000-0000-0000-000000000003", // burn sink
]);

const EXCLUDED_EMAILS = new Set([
  "marketmaker@system.local",
  "mm@tradesynapse.com",
  "mint@system.local",
]);

type UserRow = {
  id: string;
  email: string;
  role: string | null;
  created_at: string;
};

type BalanceRow = {
  email: string;
  symbol: string;
  posted: string;
  held: string;
  available: string;
};

async function main() {
  const sql = getSql();

  const users = await sql<UserRow[]>`
    SELECT id::text AS id,
           lower(email) AS email,
           role,
           created_at::text AS created_at
    FROM app_user
    WHERE email IS NOT NULL
      AND password_hash IS NOT NULL
      AND id::text NOT IN (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003'
      )
      AND lower(email) NOT IN (
        'marketmaker@system.local',
        'mm@tradesynapse.com',
        'mint@system.local'
      )
    ORDER BY created_at ASC
  `;

  const userCount = users.length;

  const balances = await sql<BalanceRow[]>`
    WITH real_users AS (
      SELECT id, lower(email) AS email
      FROM app_user
      WHERE email IS NOT NULL
        AND password_hash IS NOT NULL
        AND id::text NOT IN (
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000003'
        )
        AND lower(email) NOT IN (
          'marketmaker@system.local',
          'mm@tradesynapse.com',
          'mint@system.local'
        )
    ),
    accts AS (
      SELECT a.id AS account_id, a.user_id, a.asset_id, u.email
      FROM ex_ledger_account a
      JOIN real_users u ON u.id = a.user_id
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
    )
    SELECT
      accts.email AS email,
      asset.symbol AS symbol,
      coalesce(posted.posted, 0)::text AS posted,
      coalesce(held.held, 0)::text AS held,
      (coalesce(posted.posted, 0) - coalesce(held.held, 0))::text AS available
    FROM accts
    JOIN ex_asset asset ON asset.id = accts.asset_id
    LEFT JOIN posted ON posted.account_id = accts.account_id
    LEFT JOIN held ON held.account_id = accts.account_id
    ORDER BY accts.email ASC, asset.symbol ASC
  `;

  const totals = await sql<{ symbol: string; total_available: string }[]>`
    WITH real_users AS (
      SELECT id
      FROM app_user
      WHERE email IS NOT NULL
        AND password_hash IS NOT NULL
        AND id::text NOT IN (
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000003'
        )
        AND lower(email) NOT IN (
          'marketmaker@system.local',
          'mm@tradesynapse.com',
          'mint@system.local'
        )
    ),
    accts AS (
      SELECT a.id AS account_id, a.asset_id
      FROM ex_ledger_account a
      JOIN real_users u ON u.id = a.user_id
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
    )
    SELECT
      asset.symbol AS symbol,
      sum(coalesce(posted.posted, 0) - coalesce(held.held, 0))::text AS total_available
    FROM accts
    JOIN ex_asset asset ON asset.id = accts.asset_id
    LEFT JOIN posted ON posted.account_id = accts.account_id
    LEFT JOIN held ON held.account_id = accts.account_id
    GROUP BY asset.symbol
    ORDER BY asset.symbol ASC
  `;

  console.log("\n=== Real Users (email+password, excluding system) ===");
  console.log(`count=${userCount}`);
  console.table(users.map((u) => ({ email: u.email, role: u.role ?? "user", id: u.id })));

  const gmailUsers = users.filter((u) => u.email.endsWith("@gmail.com"));
  console.log("\n=== Gmail Users (likely human accounts) ===");
  console.log(`count=${gmailUsers.length}`);
  console.table(gmailUsers.map((u) => ({ email: u.email, role: u.role ?? "user", id: u.id })));

  console.log("\n=== Available Balances (posted - active holds) ===");
  console.table(
    balances.map((b) => ({
      email: b.email,
      symbol: b.symbol,
      available: b.available,
      posted: b.posted,
      held: b.held,
    }))
  );

  console.log("\n=== Available Balances (gmail users only) ===");
  const gmailEmails = new Set(gmailUsers.map((u) => u.email));
  console.table(
    balances
      .filter((b) => gmailEmails.has(b.email))
      .map((b) => ({
        email: b.email,
        symbol: b.symbol,
        available: b.available,
        posted: b.posted,
        held: b.held,
      }))
  );

  console.log("\n=== Totals Across Real Users ===");
  console.table(totals.map((t) => ({ symbol: t.symbol, total_available: t.total_available })));

  process.exit(0);
}

main().catch((err) => {
  console.error("report failed:", err);
  process.exit(1);
});
