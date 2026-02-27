import "dotenv/config";

import { getSql } from "../src/lib/db";

type EntryRow = {
  id: string;
  type: string;
  reference: string | null;
  created_at: string;
  metadata_json: unknown;
};

type LineRow = {
  entry_id: string;
  line_id: string;
  asset_symbol: string;
  amount: string;
  account_id: string;
  user_id: string;
  user_email: string | null;
};

type ChainTxRow = {
  tx_hash: string;
  type: string;
  user_id: string | null;
  block_height: number;
  created_at: string;
};

function usage(): never {
  console.error("Usage: tsx scripts/audit-transfer-ledger.ts <transfer_entry_id>");
  process.exit(2);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function printEntry(sql: ReturnType<typeof getSql>, entryId: string) {
  const entryRows = await sql<EntryRow[]>`
    SELECT
      id::text AS id,
      type,
      reference,
      created_at::text AS created_at,
      metadata_json
    FROM ex_journal_entry
    WHERE id = ${entryId}::uuid
    LIMIT 1
  `;

  const entry = entryRows[0];
  if (!entry) {
    console.log(`\nEntry ${entryId} not found in ex_journal_entry.`);
    return { found: false as const };
  }

  console.log("\n=== ex_journal_entry ===");
  console.table([
    {
      id: entry.id,
      type: entry.type,
      reference: entry.reference,
      created_at: entry.created_at,
    },
  ]);

  console.log("metadata_json:");
  console.log(JSON.stringify(entry.metadata_json, null, 2));

  const chainRows = await sql<ChainTxRow[]>`
    SELECT
      t.tx_hash,
      t.type,
      t.user_id::text AS user_id,
      b.height AS block_height,
      t.created_at::text AS created_at
    FROM ex_chain_tx t
    JOIN ex_chain_block b ON b.id = t.block_id
    WHERE t.entry_id = ${entryId}::uuid
    ORDER BY t.created_at ASC, t.tx_hash ASC
  `;

  if (chainRows.length) {
    console.log("\n=== ex_chain_tx (for entry) ===");
    console.table(chainRows);
  }

  const lineRows = await sql<LineRow[]>`
    SELECT
      l.entry_id::text AS entry_id,
      l.id::text AS line_id,
      a.symbol AS asset_symbol,
      l.amount::text AS amount,
      l.account_id::text AS account_id,
      la.user_id::text AS user_id,
      u.email AS user_email
    FROM ex_journal_line l
    JOIN ex_asset a ON a.id = l.asset_id
    JOIN ex_ledger_account la ON la.id = l.account_id
    LEFT JOIN app_user u ON u.id = la.user_id
    WHERE l.entry_id = ${entryId}::uuid
    ORDER BY a.symbol ASC, l.amount ASC, l.id ASC
  `;

  console.log("\n=== ex_journal_line (for entry) ===");
  if (lineRows.length === 0) {
    console.log("(no journal lines found)");
  } else {
    console.table(
      lineRows.map((r) => ({
        asset: r.asset_symbol,
        amount: r.amount,
        user_id: r.user_id,
        user_email: r.user_email ?? "(none)",
        account_id: r.account_id,
        line_id: r.line_id,
      })),
    );
  }

  // Sum check per asset
  const sums = new Map<string, bigint>();
  for (const r of lineRows) {
    const cur = sums.get(r.asset_symbol) ?? 0n;
    const next = cur + BigInt(Math.trunc(Number(r.amount) * 1e6)) * 1000000000000n; // approx only
    sums.set(r.asset_symbol, next);
  }

  // Better exact sum using NUMERIC aggregation in Postgres
  const sumRows = await sql<{ asset_symbol: string; sum: string }[]>`
    SELECT a.symbol AS asset_symbol, coalesce(sum(l.amount), 0)::text AS sum
    FROM ex_journal_line l
    JOIN ex_asset a ON a.id = l.asset_id
    WHERE l.entry_id = ${entryId}::uuid
    GROUP BY a.symbol
    ORDER BY a.symbol
  `;

  console.log("\n=== sum(amount) by asset ===");
  console.table(sumRows);

  return { found: true as const, entry };
}

async function main() {
  const entryId = process.argv[2];
  if (!entryId || !isUuid(entryId)) usage();

  const sql = getSql();

  console.log(`Auditing transfer ledger for entry_id=${entryId}`);

  const base = await printEntry(sql, entryId);
  if (!base.found) process.exit(1);

  // Fee entry is linked via reference 'fee:<transfer_entry_id>'
  const feeEntryRows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM ex_journal_entry
    WHERE type = 'user_transfer_fee'
      AND reference = ${`fee:${entryId}`}
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `;

  const feeEntryId = feeEntryRows[0]?.id;
  if (feeEntryId) {
    console.log(`\nFound fee entry: ${feeEntryId}`);
    await printEntry(sql, feeEntryId);
  } else {
    console.log("\nNo fee entry found (type=user_transfer_fee, reference=fee:<entry_id>).");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
