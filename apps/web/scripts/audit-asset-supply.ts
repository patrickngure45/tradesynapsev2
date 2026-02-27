import "dotenv/config";

import { getSql } from "../src/lib/db";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
const CAP_USER_ID = "00000000-0000-0000-0000-000000000002";
const BURN_USER_ID = "00000000-0000-0000-0000-000000000003";

type DistRow = { bucket: string; posted: string };

type HolderRow = {
  user_id: string;
  email: string | null;
  posted: string;
};

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function usage(): never {
  console.error("Usage: tsx scripts/audit-asset-supply.ts --symbol <SYMBOL> [--top <N>] [--chain <CHAIN>] ");
  process.exit(2);
}

async function main() {
  const symbol = (argValue("--symbol") ?? "").trim().toUpperCase();
  const chain = (argValue("--chain") ?? "bsc").trim().toLowerCase();
  const topN = Math.max(0, Math.min(50, Number(argValue("--top") ?? 10) || 10));

  if (!symbol) usage();

  const sql = getSql();

  const assets = await sql<{ id: string; symbol: string; chain: string }[]>`
    SELECT id::text AS id, symbol, chain
    FROM ex_asset
    WHERE chain = ${chain} AND symbol = ${symbol} AND is_enabled = true
    LIMIT 1
  `;

  const asset = assets[0];
  if (!asset) {
    console.error(`Asset not found/enabled: ${symbol} on ${chain}`);
    process.exit(1);
  }

  console.log(`Asset: ${asset.symbol} (${asset.chain}) id=${asset.id}`);

  const dist = await sql<DistRow[]>`
    WITH per_user AS (
      SELECT a.user_id,
             coalesce(sum(l.amount), 0)::numeric AS posted
      FROM ex_ledger_account a
      LEFT JOIN ex_journal_line l ON l.account_id = a.id
      WHERE a.asset_id = ${asset.id}::uuid
      GROUP BY a.user_id
    )
    SELECT
      CASE
        WHEN user_id = ${SYSTEM_USER_ID}::uuid THEN 'system'
        WHEN user_id = ${CAP_USER_ID}::uuid THEN 'cap'
        WHEN user_id = ${BURN_USER_ID}::uuid THEN 'burn'
        ELSE 'users'
      END AS bucket,
      sum(posted)::text AS posted
    FROM per_user
    GROUP BY 1
    ORDER BY 1
  `;

  console.log("\nPosted totals by bucket:");
  console.table(dist);

  const net = await sql<{ net: string }[]>`
    SELECT coalesce(sum(l.amount), 0)::text AS net
    FROM ex_journal_line l
    WHERE l.asset_id = ${asset.id}::uuid
  `;
  console.log(`\nNet (sum of ALL journal lines for asset) = ${net[0]?.net ?? "0"}`);

  if (topN > 0) {
    const holders = await sql<HolderRow[]>`
      WITH per_user AS (
        SELECT a.user_id,
               coalesce(sum(l.amount), 0)::numeric AS posted
        FROM ex_ledger_account a
        LEFT JOIN ex_journal_line l ON l.account_id = a.id
        WHERE a.asset_id = ${asset.id}::uuid
        GROUP BY a.user_id
      )
      SELECT
        p.user_id::text AS user_id,
        u.email,
        p.posted::text AS posted
      FROM per_user p
      LEFT JOIN app_user u ON u.id = p.user_id
      WHERE p.posted <> 0
      ORDER BY abs(p.posted) DESC, p.user_id
      LIMIT ${topN}
    `;

    console.log(`\nTop ${topN} holders by |posted| (includes system/cap/burn):`);
    console.table(holders);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
