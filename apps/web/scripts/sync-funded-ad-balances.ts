import "dotenv/config";

import { getSql } from "../src/lib/db";
import type { Sql } from "postgres";
import { fromBigInt3818, toBigInt3818, toBigInt3818Signed } from "../src/lib/exchange/fixed3818";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";

function parseArgValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseAmountOrThrow(label: string, raw: string): string {
  const s = raw.trim();
  if (!s) throw new Error(`Empty amount for ${label}`);
  toBigInt3818(s);
  return s;
}

function fromBigInt3818Signed(value: bigint): string {
  if (value === 0n) return "0";
  if (value < 0n) return `-${fromBigInt3818(-value)}`;
  return fromBigInt3818(value);
}

async function ensureSystemUser(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country, display_name)
    VALUES (${SYSTEM_TREASURY_USER_ID}::uuid, 'active', 'none', NULL, 'System Treasury')
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

type UserRow = { id: string; email: string | null; display_name: string | null; role: string };

async function getAgentsFromAds(sql: Sql): Promise<UserRow[]> {
  return await sql<UserRow[]>`
    SELECT u.id::text AS id, u.email, u.display_name, u.role
    FROM app_user u
    WHERE u.role <> 'admin'
      AND EXISTS (SELECT 1 FROM p2p_ad ad WHERE ad.user_id = u.id)
    ORDER BY u.email NULLS LAST, u.id
  `;
}

async function getAdmins(sql: Sql): Promise<UserRow[]> {
  return await sql<UserRow[]>`
    SELECT id::text AS id, email, display_name, role
    FROM app_user
    WHERE role = 'admin'
    ORDER BY email NULLS LAST, id
  `;
}

async function getPosted(sql: Sql, accountId: string): Promise<bigint> {
  const rows = await sql<{ posted: string }[]>`
    SELECT coalesce(sum(amount),0)::text AS posted
    FROM ex_journal_line
    WHERE account_id = ${accountId}::uuid
  `;
  return toBigInt3818Signed(rows[0]?.posted ?? "0");
}

async function getHeldRemaining(sql: Sql, accountId: string): Promise<bigint> {
  const rows = await sql<{ held: string }[]>`
    SELECT coalesce(sum(remaining_amount),0)::text AS held
    FROM ex_hold
    WHERE account_id = ${accountId}::uuid
      AND status = 'active'
  `;
  return toBigInt3818Signed(rows[0]?.held ?? "0");
}

async function postDelta(sql: Sql, params: {
  assetId: string;
  userId: string;
  userEmail: string | null;
  userRole: string;
  delta: bigint;
  reference: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  if (params.delta === 0n) return;
  const userAcct = await ensureLedgerAccount(sql, params.userId, params.assetId);
  const treasuryAcct = await ensureLedgerAccount(sql, SYSTEM_TREASURY_USER_ID, params.assetId);

  const entry = await sql<{ id: string }[]>`
    INSERT INTO ex_journal_entry (type, reference, metadata_json)
    VALUES (
      'admin_sync_funded_ads_balance',
      ${params.reference},
      ${params.metadata}::jsonb
    )
    RETURNING id::text AS id
  `;
  const entryId = entry[0]!.id;
  const d = fromBigInt3818Signed(params.delta);
  const neg = fromBigInt3818Signed(-params.delta);

  await sql`
    INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
    VALUES
      (${entryId}::uuid, ${userAcct}::uuid, ${params.assetId}::uuid, (${d}::numeric)),
      (${entryId}::uuid, ${treasuryAcct}::uuid, ${params.assetId}::uuid, (${neg}::numeric))
  `;
}

async function syncUser(sql: Sql, user: UserRow, usdtAssetId: string, freeAmountBi: bigint, adminFloorBi: bigint, apply: boolean) {
  const acct = await ensureLedgerAccount(sql, user.id, usdtAssetId);
  const posted = await getPosted(sql, acct);
  const held = await getHeldRemaining(sql, acct);

  const target = user.role === "admin"
    ? (held > adminFloorBi ? held : adminFloorBi)
    : held + freeAmountBi;

  const delta = target - posted;

  console.log(
    `[${user.role}] ${user.email ?? user.id} held=${fromBigInt3818Signed(held)} posted=${fromBigInt3818Signed(posted)} target=${fromBigInt3818Signed(target)} delta=${fromBigInt3818Signed(delta)}`,
  );

  if (!apply || delta === 0n) return;

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;
    await postDelta(txSql, {
      assetId: usdtAssetId,
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      delta,
      reference: `sync_funded_ads:${user.id}:USDT`,
      metadata: {
        userId: user.id,
        email: user.email,
        role: user.role,
        held: fromBigInt3818Signed(held),
        postedBefore: fromBigInt3818Signed(posted),
        target: fromBigInt3818Signed(target),
        delta: fromBigInt3818Signed(delta),
        mode: user.role === "admin" ? "admin_floor" : "held_plus_free",
      },
    });
  });
}

async function main() {
  const apply = hasFlag("--apply") || String(process.env.APPLY ?? "") === "1";
  const chain = (parseArgValue("--chain") ?? process.env.CHAIN ?? "bsc").trim();
  const free = parseAmountOrThrow("free-usdt", parseArgValue("--free-usdt") ?? process.env.FREE_USDT ?? "20");
  const adminFloor = parseAmountOrThrow("admin-usdt", parseArgValue("--admin-usdt") ?? process.env.ADMIN_USDT ?? "3000");

  const sql = getSql();
  await ensureSystemUser(sql);
  const usdtAssetId = await getAssetId(sql, chain, "USDT");

  const freeBi = toBigInt3818(free);
  const adminFloorBi = toBigInt3818(adminFloor);

  const agents = await getAgentsFromAds(sql);
  const admins = await getAdmins(sql);
  console.log(`[sync-funded-ad-balances] apply=${apply} chain=${chain} agents=${agents.length} free=${free} admins=${admins.length} adminFloor=${adminFloor}`);

  for (const a of agents) {
    await syncUser(sql, a, usdtAssetId, freeBi, adminFloorBi, apply);
  }
  for (const a of admins) {
    await syncUser(sql, a, usdtAssetId, freeBi, adminFloorBi, apply);
  }

  await sql.end({ timeout: 5 }).catch(() => undefined);
}

main().catch((err) => {
  console.error("[sync-funded-ad-balances] failed:", err);
  process.exit(1);
});
