import "dotenv/config";

import { ethers } from "ethers";

import { getSql } from "../src/lib/db";
import { getBscProvider, getEthProvider } from "../src/lib/blockchain/wallet";
import { getTokenBalance } from "../src/lib/blockchain/tokens";
import { createNotification } from "../src/lib/notifications";

/** Well-known system/omnibus ledger account owner (must match migration 007). */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBlockChunkSize(): number {
  const raw = Number.parseInt(process.env.DEPOSIT_SCAN_BLOCK_CHUNK ?? "50", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.min(2000, raw);
}

function getMaxRetries(): number {
  const raw = Number.parseInt(process.env.DEPOSIT_SCAN_RETRIES ?? "6", 10);
  if (!Number.isFinite(raw) || raw < 0) return 6;
  return Math.min(20, raw);
}

function isRateLimitError(err: unknown): boolean {
  const msg = String(err ?? "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("429") ||
    msg.includes("-32005")
  );
}

async function getLogsWithRetry(
  provider: ethers.JsonRpcProvider,
  params: Parameters<ethers.JsonRpcProvider["getLogs"]>[0],
): Promise<ethers.Log[]> {
  const maxRetries = getMaxRetries();
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await provider.getLogs(params);
    } catch (err) {
      attempt += 1;
      if (!isRateLimitError(err) || attempt > maxRetries) throw err;
      const backoffMs = Math.min(5000, 300 * Math.pow(2, attempt - 1));
      console.log(`[deposit-scan] rate-limited, retry ${attempt}/${maxRetries} in ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }
}

function getScanChain(): "bsc" | "eth" {
  const raw = (process.env.DEPOSIT_SCAN_CHAIN ?? "bsc").trim().toLowerCase();
  if (raw === "eth") return "eth";
  return "bsc";
}

function getProvider(chain: "bsc" | "eth"): ethers.JsonRpcProvider {
  return chain === "eth" ? getEthProvider() : getBscProvider();
}

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

type DepositAddressRow = { user_id: string; address: string };
type TokenAssetRow = { assetId: string; symbol: string; contract: string; decimals: number };

async function creditByOnchainDeltaFallback(
  sql: ReturnType<typeof getSql>,
  chain: "bsc" | "eth",
  dep: DepositAddressRow,
  tok: TokenAssetRow,
  safeToBlock: number,
): Promise<number> {
  const onchainBal = await getTokenBalance(tok.contract, dep.address);
  const onchainAmount = onchainBal.balance ?? "0";

  const postedRows = await sql<{ posted: string }[]>`
    SELECT coalesce(sum(jl.amount), 0)::text AS posted
    FROM ex_ledger_account acct
    LEFT JOIN ex_journal_line jl ON jl.account_id = acct.id
    WHERE acct.user_id = ${dep.user_id}::uuid
      AND acct.asset_id = ${tok.assetId}::uuid
  `;

  const posted = postedRows[0]?.posted ?? "0";
  const deltaRows = await sql<{ delta: string }[]>`
    SELECT ((${onchainAmount}::numeric) - (${posted}::numeric))::text AS delta
  `;

  const delta = deltaRows[0]?.delta ?? "0";
  if (!(Number(delta) > 0)) return 0;

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as ReturnType<typeof getSql>;

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
        ${`fallback-balance:${chain}:${tok.symbol}:${dep.address.toLowerCase()}:${safeToBlock}`},
        ${txSql.json({
          mode: "rate_limit_fallback_balance_delta",
          chain,
          to: dep.address.toLowerCase(),
          asset: tok.symbol,
          asset_id: tok.assetId,
          onchain_amount: onchainAmount,
          posted_amount_before: posted,
          credited_amount: delta,
          safe_to_block: safeToBlock,
        })}::jsonb
      )
      RETURNING id
    `;

    const entryId = entryRows[0]!.id;

    await txSql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}, ${userAcct[0]!.id}, ${tok.assetId}::uuid, (${delta}::numeric)),
        (${entryId}, ${systemAcct[0]!.id}, ${tok.assetId}::uuid, ((${delta}::numeric) * -1))
    `;

    await createNotification(txSql, {
      userId: dep.user_id,
      type: "deposit_credited",
      title: "Deposit Credited",
      body: `Your deposit of ${delta} ${tok.symbol} has been credited to your ${tok.symbol} balance.`,
      metadata: {
        chain,
        asset: tok.symbol,
        amount: delta,
        mode: "rate_limit_fallback_balance_delta",
      },
    });
  });

  return Number(delta);
}

async function main() {
  const sql = getSql();
  const chain = getScanChain();
  const provider = getProvider(chain);

  const confirmations = getConfirmations();
  const blockChunk = getBlockChunkSize();
  const currentBlock = await provider.getBlockNumber();
  const safeToBlock = Math.max(0, currentBlock - confirmations);

  await ensureSystemUser(sql);

  const cursorRows = await sql<{ last_scanned_block: number }[]>`
    SELECT last_scanned_block
    FROM ex_chain_deposit_cursor
    WHERE chain = ${chain}
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
    WHERE chain = ${chain}
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
    WHERE chain = ${chain}
  `;

  console.log(
    `[deposit-scan] scanning ${chain} blocks ${fromBlock}..${safeToBlock} addrs=${depositAddrs.length} tokens=${tokenAssets.length}`,
  );

  let credited = 0;
  let seenEvents = 0;
  let fallbackCredits = 0;

  for (const dep of depositAddrs) {
    const toTopic = toTopicAddress(dep.address);

    for (const tok of tokenAssets) {
      const logs: ethers.Log[] = [];
      let fallbackUsed = false;
      for (let chunkFrom = fromBlock; chunkFrom <= safeToBlock; chunkFrom += blockChunk) {
        const chunkTo = Math.min(safeToBlock, chunkFrom + blockChunk - 1);
        let chunkLogs: ethers.Log[] = [];
        try {
          chunkLogs = await getLogsWithRetry(provider, {
            address: tok.contract,
            fromBlock: chunkFrom,
            toBlock: chunkTo,
            topics: [TRANSFER_TOPIC, null, toTopic],
          });
        } catch (err) {
          if (!isRateLimitError(err)) throw err;
          fallbackUsed = true;
          console.log(
            `[deposit-scan] falling back to on-chain balance delta for ${tok.symbol} -> ${dep.address}`,
          );
          break;
        }
        if (chunkLogs.length > 0) logs.push(...chunkLogs);
      }

      if (fallbackUsed) {
        const creditedAmt = await creditByOnchainDeltaFallback(sql, chain, dep, tok, safeToBlock);
        if (creditedAmt > 0) {
          credited += 1;
          fallbackCredits += 1;
        }
        continue;
      }

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
            ${chain},
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

        // Credit ledger in the same asset (Binance-style).
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
              ${`${chain}:${txHash}`},
              ${JSON.stringify({ chain, tx_hash: txHash, log_index: logIndex, to: dep.address, asset: tok.symbol, amount })}::jsonb
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
            WHERE chain = ${chain} AND tx_hash = ${txHash} AND log_index = ${logIndex}
          `;

          await createNotification(txSql, {
            userId: dep.user_id,
            type: "deposit_credited",
            title: "Deposit Credited",
            body: `Your deposit of ${amount} ${tok.symbol} has been credited to your ${tok.symbol} balance.`,
            metadata: { chain, txHash, asset: tok.symbol, amount },
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

  console.log(
    `[deposit-scan] done seenEvents=${seenEvents} credited=${credited} fallbackCredits=${fallbackCredits} advancedTo=${safeToBlock}`,
  );
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("[deposit-scan] fatal:", e);
  process.exit(1);
});
