import { ethers } from "ethers";
import type { Sql } from "postgres";

import { getBscProvider } from "@/lib/blockchain/wallet";
import { createNotification } from "@/lib/notifications";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeAddress(addr: string): string {
  return String(addr || "").trim().toLowerCase();
}

function decodeTopicAddress(topic: string): string {
  // topic = 0x + 64 hex chars; address is last 40 chars.
  const t = String(topic || "");
  if (!t.startsWith("0x") || t.length !== 66) return "";
  return "0x" + t.slice(-40).toLowerCase();
}

type DepositAsset = {
  id: string;
  symbol: string;
  decimals: number;
  contract_address: string;
};

async function ensureSystemUser(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${SYSTEM_USER_ID}::uuid, 'active', 'full', 'ZZ')
    ON CONFLICT (id) DO NOTHING
  `;
}

async function creditDepositEvent(
  sql: Sql,
  args: {
    chain: "bsc";
    txHash: string;
    logIndex: number;
    blockNumber: number;
    fromAddress: string | null;
    toAddress: string;
    userId: string;
    assetId: string;
    assetSymbol: string;
    amount: string;
  },
): Promise<"credited" | "duplicate"> {
  // Full idempotency is provided by ex_chain_deposit_event_uniq (chain, tx_hash, log_index).
  return await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    const inserted = await txSql<
      { id: number }[]
    >`
      INSERT INTO ex_chain_deposit_event (
        chain, tx_hash, log_index, block_number, from_address, to_address,
        user_id, asset_id, amount
      )
      VALUES (
        ${args.chain},
        ${args.txHash},
        ${args.logIndex},
        ${args.blockNumber},
        ${args.fromAddress},
        ${args.toAddress},
        ${args.userId}::uuid,
        ${args.assetId}::uuid,
        (${args.amount}::numeric)
      )
      ON CONFLICT (chain, tx_hash, log_index) DO NOTHING
      RETURNING id
    `;

    if (inserted.length === 0) return "duplicate";

    await ensureSystemUser(txSql as any);

    const userAccountRows = await txSql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${args.userId}::uuid, ${args.assetId}::uuid)
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;

    const systemAccountRows = await txSql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${SYSTEM_USER_ID}::uuid, ${args.assetId}::uuid)
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;

    const reference = `${args.chain}:${args.txHash}:${args.logIndex}`;
    const entryRows = await (txSql as any)<{ id: string }[]>`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'deposit',
        ${reference},
        ${
          {
            chain: args.chain,
            tx_hash: args.txHash,
            log_index: args.logIndex,
            block_number: args.blockNumber,
            from_address: args.fromAddress,
            to_address: args.toAddress,
            asset_id: args.assetId,
            asset_symbol: args.assetSymbol,
            amount: args.amount,
          } as any
        }::jsonb
      )
      RETURNING id
    `;
    const entryId = entryRows[0]!.id;

    await txSql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}::uuid, ${userAccountRows[0]!.id}::uuid, ${args.assetId}::uuid, (${args.amount}::numeric)),
        (${entryId}::uuid, ${systemAccountRows[0]!.id}::uuid, ${args.assetId}::uuid, ((${args.amount}::numeric) * -1))
    `;

    await txSql`
      UPDATE ex_chain_deposit_event
      SET journal_entry_id = ${entryId}::uuid
      WHERE chain = ${args.chain}
        AND tx_hash = ${args.txHash}
        AND log_index = ${args.logIndex}
    `;

    await createNotification(txSql as any, {
      userId: args.userId,
      type: "deposit_credited",
      title: "Deposit credited",
      body: `+${args.amount} ${args.assetSymbol} (BSC)`,
      metadata: {
        asset_symbol: args.assetSymbol,
        chain: args.chain,
        amount: args.amount,
        tx_hash: args.txHash,
        log_index: args.logIndex,
        entry_id: entryId,
      },
    });

    return "credited";
  });
}

async function getOrInitCursor(sql: Sql, chain: "bsc"): Promise<number> {
  const rows = await sql<{ last_scanned_block: number }[]>`
    SELECT last_scanned_block
    FROM ex_chain_deposit_cursor
    WHERE chain = ${chain}
    LIMIT 1
  `;
  if (rows.length > 0) return Number(rows[0]!.last_scanned_block ?? 0) || 0;

  await sql`
    INSERT INTO ex_chain_deposit_cursor (chain, last_scanned_block)
    VALUES (${chain}, 0)
    ON CONFLICT (chain) DO NOTHING
  `;
  return 0;
}

async function updateCursor(sql: Sql, chain: "bsc", lastScannedBlock: number): Promise<void> {
  await sql`
    INSERT INTO ex_chain_deposit_cursor (chain, last_scanned_block, updated_at)
    VALUES (${chain}, ${lastScannedBlock}, now())
    ON CONFLICT (chain)
    DO UPDATE SET last_scanned_block = EXCLUDED.last_scanned_block, updated_at = now()
  `;
}

export async function scanAndCreditBscDeposits(
  sql: Sql,
  opts?: {
    fromBlock?: number;
    maxBlocks?: number;
    confirmations?: number;
    blocksPerBatch?: number;
  },
): Promise<{
  ok: true;
  chain: "bsc";
  fromBlock: number;
  toBlock: number;
  tip: number;
  confirmations: number;
  batches: number;
  assets: number;
  checkedLogs: number;
  matchedDeposits: number;
  credited: number;
  duplicates: number;
}> {
  const provider = getBscProvider();
  const chain: "bsc" = "bsc";

  const confirmations = clamp(opts?.confirmations ?? envInt("BSC_DEPOSIT_CONFIRMATIONS", 2), 0, 200);
  const blocksPerBatch = clamp(opts?.blocksPerBatch ?? envInt("BSC_DEPOSIT_BLOCKS_PER_BATCH", 1200), 10, 10_000);
  const maxBlocks = clamp(opts?.maxBlocks ?? envInt("BSC_DEPOSIT_MAX_BLOCKS_PER_RUN", 15_000), 10, 200_000);

  const tip = await provider.getBlockNumber();
  const safeTip = Math.max(0, tip - confirmations);

  const cursor = await getOrInitCursor(sql, chain);
  const startFromCursor = cursor + 1;
  const fromBlock = Math.max(0, Math.min(safeTip, opts?.fromBlock ?? startFromCursor));
  const toBlock = Math.min(safeTip, fromBlock + maxBlocks - 1);

  // Nothing to do.
  if (fromBlock > toBlock) {
    return {
      ok: true,
      chain,
      fromBlock,
      toBlock,
      tip,
      confirmations,
      batches: 0,
      assets: 0,
      checkedLogs: 0,
      matchedDeposits: 0,
      credited: 0,
      duplicates: 0,
    };
  }

  const depositAddresses = await sql<{ user_id: string; address: string }[]>`
    SELECT user_id::text AS user_id, address
    FROM ex_deposit_address
    WHERE chain = ${chain} AND status = 'active'
  `;
  const addressToUser = new Map<string, string>();
  for (const row of depositAddresses) {
    const address = normalizeAddress(row.address);
    if (!address) continue;
    addressToUser.set(address, String(row.user_id));
  }

  const assets = await sql<DepositAsset[]>`
    SELECT id::text AS id, symbol, decimals, contract_address
    FROM ex_asset
    WHERE chain = ${chain}
      AND is_enabled = true
      AND contract_address IS NOT NULL
    ORDER BY symbol ASC
  `;

  const transferTopic = ethers.id("Transfer(address,address,uint256)");

  let batches = 0;
  let checkedLogs = 0;
  let matchedDeposits = 0;
  let credited = 0;
  let duplicates = 0;

  for (let start = fromBlock; start <= toBlock; start += blocksPerBatch) {
    const end = Math.min(toBlock, start + blocksPerBatch - 1);
    batches += 1;

    for (const asset of assets) {
      const contract = normalizeAddress(asset.contract_address);
      if (!contract) continue;

      const logs = await provider.getLogs({
        address: contract,
        fromBlock: start,
        toBlock: end,
        topics: [transferTopic],
      });

      checkedLogs += logs.length;

      for (const log of logs) {
        // Transfer(address indexed from, address indexed to, uint256 value)
        const to = decodeTopicAddress(log.topics?.[2] ?? "");
        if (!to) continue;
        const userId = addressToUser.get(to);
        if (!userId) continue;

        const from = decodeTopicAddress(log.topics?.[1] ?? "") || null;
        const amountRaw = BigInt(log.data);
        if (amountRaw <= 0n) continue;

        matchedDeposits += 1;
        const amount = ethers.formatUnits(amountRaw, asset.decimals);

        const outcome = await creditDepositEvent(sql as any, {
          chain,
          txHash: String(log.transactionHash),
          logIndex: Number(log.index),
          blockNumber: Number(log.blockNumber),
          fromAddress: from,
          toAddress: to,
          userId,
          assetId: asset.id,
          assetSymbol: asset.symbol,
          amount,
        });

        if (outcome === "credited") credited += 1;
        else duplicates += 1;
      }
    }

    // Cursor advances only after all assets for the batch are processed.
    await updateCursor(sql, chain, end);
  }

  return {
    ok: true,
    chain,
    fromBlock,
    toBlock,
    tip,
    confirmations,
    batches,
    assets: assets.length,
    checkedLogs,
    matchedDeposits,
    credited,
    duplicates,
  };
}
