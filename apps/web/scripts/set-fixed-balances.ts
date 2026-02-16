import "dotenv/config";
import { getSql } from "../src/lib/db";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

const TARGETS: Record<string, number> = {
  BTC: 200_000_000,
  ETH: 200_000_000,
  USDT: 200_000_000,
};

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
    RETURNING id
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

async function main() {
  const sql = getSql();
  const email = process.env.TARGET_USER_EMAIL || "ngurengure10@gmail.com";

  await ensureSystemUser(sql);

  const users = await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email = ${email} LIMIT 1`;
  if (users.length === 0) {
    throw new Error(`User not found: ${email}`);
  }
  const userId = users[0]!.id;

  for (const [symbol, target] of Object.entries(TARGETS)) {
    const assets = await sql<{ id: string }[]>`
      SELECT id
      FROM ex_asset
      WHERE chain = 'bsc' AND symbol = ${symbol} AND is_enabled = true
      LIMIT 1
    `;
    if (assets.length === 0) {
      throw new Error(`Asset not found: ${symbol} on bsc`);
    }

    const assetId = assets[0]!.id;
    const userAcct = await ensureLedgerAccount(sql, userId, assetId);
    const systemAcct = await ensureLedgerAccount(sql, SYSTEM_USER_ID, assetId);

    const current = await getPosted(sql, userAcct);
    const delta = target - current;

    if (Math.abs(delta) < 1e-12) {
      console.log(`[set-fixed-balances] ${symbol} already at target ${target}`);
      continue;
    }

    await sql.begin(async (tx: unknown) => {
      const txSql = tx as unknown as typeof sql;

      const entry = await txSql<{ id: string }[]>`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'admin_set_fixed_balance',
          ${`set_fixed:${symbol}`},
          ${{ symbol, target, userId }}::jsonb
        )
        RETURNING id
      `;
      const entryId = entry[0]!.id;

      await txSql`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${entryId}::uuid, ${userAcct}::uuid, ${assetId}::uuid, (${delta}::numeric)),
          (${entryId}::uuid, ${systemAcct}::uuid, ${assetId}::uuid, ((${delta}::numeric) * -1))
      `;
    });

    const after = await getPosted(sql, userAcct);
    console.log(`[set-fixed-balances] ${symbol}: ${current} -> ${after}`);
  }
}

main().catch((err) => {
  console.error("[set-fixed-balances] failed:", err);
  process.exit(1);
});
