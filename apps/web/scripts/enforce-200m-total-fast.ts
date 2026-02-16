import "dotenv/config";

import { getSql } from "../src/lib/db";

const ADMIN_EMAIL = "ngurengure10@gmail.com";
const TARGET = 200_000_000;
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

async function ensureSystemUser(sql: ReturnType<typeof getSql>) {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${SYSTEM_USER_ID}::uuid, 'active', 'full', 'ZZ')
    ON CONFLICT (id) DO NOTHING
  `;
}

async function ensureLedgerAccount(sql: ReturnType<typeof getSql>, userId: string, assetId: string) {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `;
  return rows[0]!.id;
}

async function getPosted(sql: ReturnType<typeof getSql>, accountId: string): Promise<number> {
  const rows = await sql<{ posted: string }[]>`
    SELECT coalesce(sum(amount),0)::text AS posted
    FROM ex_journal_line
    WHERE account_id = ${accountId}::uuid
  `;
  const n = Number(rows[0]?.posted ?? "0");
  return Number.isFinite(n) ? n : 0;
}

async function adjustToTarget(
  sql: ReturnType<typeof getSql>,
  userId: string,
  userEmail: string,
  assetId: string,
  symbol: string,
  target: number,
) {
  const userAcct = await ensureLedgerAccount(sql, userId, assetId);
  const systemAcct = await ensureLedgerAccount(sql, SYSTEM_USER_ID, assetId);
  const current = await getPosted(sql, userAcct);
  const delta = target - current;
  if (Math.abs(delta) < 1e-12) return false;

  await sql.begin(async (tx: unknown) => {
    const t = tx as unknown as typeof sql;
    const entry = await t<{ id: string }[]>`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'admin_set_fixed_balance',
        ${`enforce_200m_total:${symbol}:${userEmail}`},
        ${{ symbol, userId, userEmail, target }}::jsonb
      )
      RETURNING id::text AS id
    `;

    await t`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entry[0]!.id}::uuid, ${userAcct}::uuid, ${assetId}::uuid, (${delta}::numeric)),
        (${entry[0]!.id}::uuid, ${systemAcct}::uuid, ${assetId}::uuid, ((${delta}::numeric) * -1))
    `;
  });

  return true;
}

async function main() {
  const sql = getSql();
  await ensureSystemUser(sql);

  const users = await sql<{ id: string; email: string }[]>`
    SELECT id::text AS id, lower(email) AS email
    FROM app_user
    WHERE email IS NOT NULL
      AND password_hash IS NOT NULL
      AND id::text NOT IN (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003'
      )
    ORDER BY created_at ASC
  `;

  const admin = users.find((u) => u.email === ADMIN_EMAIL);
  if (!admin) throw new Error(`Admin user not found: ${ADMIN_EMAIL}`);

  const assets = await sql<{ id: string; symbol: string }[]>`
    SELECT id::text AS id, symbol
    FROM ex_asset
    WHERE chain='bsc'
    ORDER BY symbol ASC
  `;
  let changes = 0;

  for (const asset of assets) {
    for (const user of users) {
      const target = user.id === admin.id ? TARGET : 0;
      const changed = await adjustToTarget(sql, user.id, user.email, asset.id, asset.symbol, target);
      if (changed) changes++;
    }
  }

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
    WHERE asset.chain='bsc'
    GROUP BY asset.symbol
    ORDER BY asset.symbol ASC
  `;

  const mismatches = totals.filter((row) => Number(row.total_available) !== TARGET);

  console.log(JSON.stringify({
    target: TARGET,
    changes,
    totalsCount: totals.length,
    mismatchCount: mismatches.length,
    mismatchSample: mismatches.slice(0, 20),
  }, null, 2));

  await sql.end();
}

main().catch((error) => {
  console.error("[enforce-200m-total-fast] failed:", error);
  process.exit(1);
});
