import "dotenv/config";

import { getSql } from "../src/lib/db";
import type { Sql } from "postgres";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";
const SYSTEM_ISSUANCE_USER_ID = "00000000-0000-0000-0000-000000000002";

function parseArgValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function toNum(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function asNumericString(n: number): string {
  const fixed = n.toFixed(18).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return fixed.length ? fixed : "0";
}

async function ensureSystemUser(sql: Sql, userId: string, label: string): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country, display_name)
    VALUES (${userId}::uuid, 'active', 'none', NULL, ${label})
    ON CONFLICT (id) DO UPDATE SET status = 'active'
  `;
}

async function getAssetId(sql: Sql, chain: string, symbol: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM ex_asset
    WHERE chain = ${chain} AND symbol = ${symbol} AND is_enabled = true
    LIMIT 1
  `;
  if (rows.length === 0) throw new Error(`Asset not found: ${chain}:${symbol}`);
  return rows[0]!.id;
}

async function ensureLedgerAccount(sql: Sql, userId: string, assetId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `;
  return rows[0]!.id;
}

async function getPosted(sql: Sql, accountId: string): Promise<number> {
  const rows = await sql<{ posted: string }[]>`
    SELECT coalesce(sum(amount),0)::text AS posted
    FROM ex_journal_line
    WHERE account_id = ${accountId}::uuid
  `;
  const n = Number(rows[0]?.posted ?? "0");
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const apply = hasFlag("--apply") || String(process.env.APPLY ?? "") === "1";
  const chain = (parseArgValue("--chain") ?? process.env.CHAIN ?? "bsc").trim();
  const symbol = (parseArgValue("--symbol") ?? process.env.SYMBOL ?? "USDT").trim().toUpperCase();
  const target =
    toNum(parseArgValue("--target")) ??
    toNum(process.env.TARGET) ??
    1_000_000;
  if (!(target > 0)) throw new Error(`Invalid target: ${target}`);

  const sql = getSql();
  await ensureSystemUser(sql, SYSTEM_TREASURY_USER_ID, "System Treasury");
  await ensureSystemUser(sql, SYSTEM_ISSUANCE_USER_ID, "System Issuance");

  const assetId = await getAssetId(sql, chain, symbol);
  const treasuryAcct = await ensureLedgerAccount(sql, SYSTEM_TREASURY_USER_ID, assetId);
  const issuanceAcct = await ensureLedgerAccount(sql, SYSTEM_ISSUANCE_USER_ID, assetId);

  const current = await getPosted(sql, treasuryAcct);
  const delta = target - current;
  console.log(`[treasury-mint] ${chain}:${symbol} current=${current} target=${target} delta=${delta} apply=${apply}`);

  if (Math.abs(delta) < 1e-12) {
    console.log("[treasury-mint] already at target");
    await sql.end({ timeout: 5 }).catch(() => undefined);
    return;
  }

  if (!apply) {
    console.log("[treasury-mint] dry-run (no changes). Use --apply to execute.");
    await sql.end({ timeout: 5 }).catch(() => undefined);
    return;
  }

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;
    const entry = await txSql<{ id: string }[]>`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'admin_treasury_mint',
        ${`treasury_mint:${chain}:${symbol}`},
        ${{ chain, symbol, target: asNumericString(target), current: asNumericString(current), delta: asNumericString(delta) }}::jsonb
      )
      RETURNING id::text AS id
    `;
    const entryId = entry[0]!.id;

    await txSql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}::uuid, ${treasuryAcct}::uuid, ${assetId}::uuid, (${asNumericString(delta)}::numeric)),
        (${entryId}::uuid, ${issuanceAcct}::uuid, ${assetId}::uuid, ((${asNumericString(delta)}::numeric) * -1))
    `;
  });

  const after = await getPosted(sql, treasuryAcct);
  console.log(`[treasury-mint] ✅ after=${after}`);
  await sql.end({ timeout: 5 }).catch(() => undefined);
}

main().catch((err) => {
  console.error("[treasury-mint] failed:", err);
  process.exit(1);
});
