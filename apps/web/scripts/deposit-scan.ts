import "dotenv/config";

import { ethers } from "ethers";

import { getSql } from "../src/lib/db";
import { getBscProvider } from "../src/lib/blockchain/wallet";
import { createNotification } from "../src/lib/notifications";

const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

function toTopicAddress(address: string): string {
  // indexed address topics are 32-byte left-padded
  return ethers.zeroPadValue(address.toLowerCase(), 32);
}

function getConfirmations(): number {
  const n = Number.parseInt(process.env.DEPOSIT_CONFIRMATIONS ?? "3", 10);
  if (!Number.isFinite(n) || n < 0) return 3;
  return Math.min(50, n);
}

function parseStartBlockFallback(currentBlock: number): number {
  const raw = process.env.DEPOSIT_SCAN_START_BLOCK;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Default: last ~5k blocks (roughly a day-ish on BSC, depending on conditions)
  return Math.max(0, currentBlock - 5000);
}

async function ensureSystemUser(sql: ReturnType<typeof getSql>) {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${SYSTEM_USER_ID}::uuid, 'active', 'full', 'ZZ')
    ON CONFLICT (id) DO NOTHING
  `;
}

async function main() {
  const sql = getSql();
  const provider = getBscProvider();

  const confirmations = getConfirmations();
  const currentBlock = await provider.getBlockNumber();
  const safeToBlock = Math.max(0, currentBlock - confirmations);

  await ensureSystemUser(sql);

  const cursorRows = await sql<{ last_scanned_block: number }[]>`
    SELECT last_scanned_block
    FROM ex_chain_deposit_cursor
    WHERE chain = 'bsc'
    LIMIT 1
  `;

  const fromBlock = cursorRows.length
    ? Math.max(0, cursorRows[0]!.last_scanned_block + 1)
    : parseStartBlockFallback(currentBlock);

  if (fromBlock > safeToBlock) {
    console.log(`[deposit-scan] nothing to do fromBlock=${fromBlock} safeToBlock=${safeToBlock}`);
    await sql.end({ timeout: 5 });
    return;
  }

  const assets = await sql<{ id: string; symbol: string; contract_address: string | null; decimals: number }[]>`
    SELECT id::text AS id, symbol, contract_address, decimals
    FROM ex_asset
    WHERE chain = 'bsc'
      AND is_enabled = true
      AND contract_address IS NOT NULL
  `;

  const tokenAssets = assets
    .filter((a) => a.contract_address)
    .map((a) => ({
      assetId: a.id,
      symbol: a.symbol,
      contract: (a.contract_address as string).toLowerCase(),
      decimals: a.decimals,
    }));

  const depositAddrs = await sql<{ user_id: string; address: string }[]>`
    SELECT user_id::text AS user_id, address
    FROM ex_deposit_address
    WHERE chain = 'bsc'
  `;

  console.log(
    `[deposit-scan] scanning bsc blocks ${fromBlock}..${safeToBlock} addrs=${depositAddrs.length} tokens=${tokenAssets.length}`,
  );

  let credited = 0;
  let seenEvents = 0;

  for (const dep of depositAddrs) {
    const toTopic = toTopicAddress(dep.address);

    for (const tok of tokenAssets) {
      const logs = await provider.getLogs({
        address: tok.contract,
        fromBlock,
        toBlock: safeToBlock,
        topics: [TRANSFER_TOPIC, null, toTopic],
      });

      if (logs.length === 0) continue;

      for (const log of logs) {
        seenEvents++;
        const txHash = log.transactionHash;
        const logIndex = log.index;
        const from = (log.topics[1] ? ethers.getAddress(ethers.dataSlice(log.topics[1], 12)) : null)?.toLowerCase() ?? null;

        // Decode value from data
        const value = ethers.toBigInt(log.data);
        if (value <= 0n) continue;
        const amount = ethers.formatUnits(value, tok.decimals);

        // Insert event row; only credit if it is new.
        const inserted = await sql<{ id: number }[]>`
          INSERT INTO ex_chain_deposit_event (
            chain, tx_hash, log_index, block_number,
            from_address, to_address,
            user_id, asset_id, amount
          )
          VALUES (
            'bsc',
            ${txHash},
            ${logIndex},
            ${log.blockNumber},
            ${from},
            ${dep.address.toLowerCase()},
            ${dep.user_id}::uuid,
            ${tok.assetId}::uuid,
            (${amount}::numeric)
          )
          ON CONFLICT (chain, tx_hash, log_index) DO NOTHING
          RETURNING id
        `;

        if (inserted.length === 0) continue;

        // Credit ledger (double-entry) and attach the journal entry id.
        await sql.begin(async (tx) => {
          const txSql = tx as unknown as typeof sql;

          const userAcct = await txSql<{ id: string }[]>`
            INSERT INTO ex_ledger_account (user_id, asset_id)
            VALUES (${dep.user_id}::uuid, ${tok.assetId}::uuid)
            ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
            RETURNING id
          `;

          const systemAcct = await txSql<{ id: string }[]>`
            INSERT INTO ex_ledger_account (user_id, asset_id)
            VALUES (${SYSTEM_USER_ID}::uuid, ${tok.assetId}::uuid)
            ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
            RETURNING id
          `;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const entryRows = await (txSql as any)<{ id: string }[]>`
            INSERT INTO ex_journal_entry (type, reference, metadata_json)
            VALUES (
              'deposit',
              ${`bsc:${txHash}`},
              ${JSON.stringify({ chain: "bsc", tx_hash: txHash, log_index: logIndex, to: dep.address, token: tok.symbol })}::jsonb
            )
            RETURNING id
          `;

          const entryId = entryRows[0]!.id;

          await txSql`
            INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
            VALUES
              (${entryId}, ${userAcct[0]!.id}, ${tok.assetId}::uuid, (${amount}::numeric)),
              (${entryId}, ${systemAcct[0]!.id}, ${tok.assetId}::uuid, ((${amount}::numeric) * -1))
          `;

          await txSql`
            UPDATE ex_chain_deposit_event
            SET journal_entry_id = ${entryId}::uuid
            WHERE chain = 'bsc' AND tx_hash = ${txHash} AND log_index = ${logIndex}
          `;

          await createNotification(txSql, {
            userId: dep.user_id,
            type: "deposit_credited",
            title: "Deposit Credited",
            body: `Your deposit of ${amount} ${tok.symbol} has been credited.`,
            metadata: { chain: "bsc", txHash, asset: tok.symbol, amount },
          });
        });

        credited++;
      }
    }
  }

  await sql`
    INSERT INTO ex_chain_deposit_cursor (chain, last_scanned_block)
    VALUES ('bsc', ${safeToBlock})
    ON CONFLICT (chain) DO UPDATE
      SET last_scanned_block = EXCLUDED.last_scanned_block,
          updated_at = now()
  `;

  console.log(`[deposit-scan] done seenEvents=${seenEvents} credited=${credited} advancedTo=${safeToBlock}`);
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("[deposit-scan] fatal:", e);
  process.exit(1);
});
