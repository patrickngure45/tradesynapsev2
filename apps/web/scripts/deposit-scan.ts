import "dotenv/config";

import { getSql } from "../src/lib/db";
import { scanAndCreditBscDeposits } from "../src/lib/blockchain/depositIngest";
import { upsertServiceHeartbeat } from "../src/lib/system/heartbeat";
import { releaseJobLock, renewJobLock, tryAcquireJobLock } from "../src/lib/system/jobLock";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "y";
}

function envInt(name: string): number | null {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function parseCsvSymbols(raw: string | undefined | null): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function isWatchMode(): boolean {
  return envBool("DEPOSIT_SCAN_WATCH", false);
}

function getPollIntervalMs(): number {
  const raw = envInt("DEPOSIT_SCAN_POLL_MS");
  if (raw != null) return clampInt(raw, 5_000, 60 * 60_000);
  return process.env.NODE_ENV === "production" ? 120_000 : 10_000;
}

async function beat(sql: ReturnType<typeof getSql>, details?: Record<string, unknown>) {
  try {
    await upsertServiceHeartbeat(sql as any, {
      service: "deposit-scan:bsc",
      status: "ok",
      details: { ...(details ?? {}) },
    });
  } catch {
    // ignore
  }
}

async function runOnce(sql: ReturnType<typeof getSql>) {
  const chain = String(process.env.DEPOSIT_SCAN_CHAIN ?? "bsc").trim().toLowerCase();
  if (chain !== "bsc") throw new Error("deposit_scan_chain_unsupported");

  const scanNative = envBool("DEPOSIT_SCAN_NATIVE", true);
  const tokenSymbols = parseCsvSymbols(process.env.DEPOSIT_SCAN_SYMBOLS);
  const allowTokenScanAll = String(process.env.ALLOW_TOKEN_SCAN_ALL ?? "").trim() === "1";

  // Token scanning defaults to OFF unless you explicitly allowlist symbols.
  const scanTokens = envBool("DEPOSIT_SCAN_TOKENS", tokenSymbols.length > 0) || tokenSymbols.length > 0 || allowTokenScanAll;

  if (process.env.NODE_ENV === "production" && scanTokens && tokenSymbols.length === 0 && !allowTokenScanAll) {
    throw new Error("token_symbols_required");
  }

  const confirmations = envInt("BSC_DEPOSIT_CONFIRMATIONS") ?? envInt("DEPOSIT_CONFIRMATIONS");
  const maxMs = envInt("BSC_DEPOSIT_MAX_MS") ?? envInt("DEPOSIT_SCAN_MAX_MS");
  const maxBlocks = envInt("BSC_DEPOSIT_MAX_BLOCKS_PER_RUN") ?? envInt("DEPOSIT_SCAN_MAX_BLOCKS");
  const blocksPerBatch = envInt("BSC_DEPOSIT_BLOCKS_PER_BATCH") ?? envInt("DEPOSIT_SCAN_BLOCKS_PER_BATCH");

  const lockTtlMs = clampInt(Number(process.env.EXCHANGE_SCAN_LOCK_TTL_MS ?? 120_000), 30_000, 60 * 60_000);
  const lockKey = "exchange:scan-deposits:bsc";
  const holderId = `deposit-worker:${process.env.RAILWAY_SERVICE_NAME ?? process.env.SERVICE_NAME ?? "local"}:${crypto.randomUUID()}`;
  const lock = await tryAcquireJobLock(sql as any, { key: lockKey, holderId, ttlMs: lockTtlMs });
  if (!lock.acquired) {
    await beat(sql, { event: "scan_in_progress", held_until: lock.held_until, holder_id: lock.holder_id });
    return;
  }

  const renewEveryMs = clampInt(Math.floor(lockTtlMs / 2), 10_000, 30_000);
  let renewTimer: ReturnType<typeof setInterval> | null = null;
  try {
    renewTimer = setInterval(() => {
      renewJobLock(sql as any, { key: lockKey, holderId, ttlMs: lockTtlMs }).catch(() => undefined);
    }, renewEveryMs);
  } catch {
    // ignore
  }

  try {
    await beat(sql, {
      event: "start",
      scanNative,
      scanTokens,
      tokenSymbols: tokenSymbols.length ? tokenSymbols : null,
      confirmations: confirmations ?? undefined,
      maxMs: maxMs ?? undefined,
      maxBlocks: maxBlocks ?? undefined,
      blocksPerBatch: blocksPerBatch ?? undefined,
    });

    const result = await scanAndCreditBscDeposits(sql as any, {
      confirmations: confirmations ?? undefined,
      maxMs: maxMs ?? undefined,
      maxBlocks: maxBlocks ?? undefined,
      blocksPerBatch: blocksPerBatch ?? undefined,
      scanNative,
      scanTokens,
      tokenSymbols: tokenSymbols.length ? tokenSymbols : undefined,
    });

    await beat(sql, { event: "done", ...result });
  } finally {
    if (renewTimer) {
      try {
        clearInterval(renewTimer);
      } catch {
        // ignore
      }
    }
    await releaseJobLock(sql as any, { key: lockKey, holderId }).catch(() => undefined);
  }
}

async function main() {
  const sql = getSql();
  const pollMs = getPollIntervalMs();

  await beat(sql, { event: isWatchMode() ? "start_watch" : "start" });

  if (!isWatchMode()) {
    try {
      await runOnce(sql);
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }
    return;
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce(sql);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await beat(sql, { event: "error", message });
      if (message === "token_symbols_required") {
        console.error("[deposit-scan] token_symbols_required: set DEPOSIT_SCAN_SYMBOLS=USDT,USDC (or set ALLOW_TOKEN_SCAN_ALL=1)");
        await sleep(Math.max(pollMs, 60_000));
        continue;
      }
    }

    await sleep(pollMs);
  }
}

main().catch((e) => {
  console.error("[deposit-scan] fatal:", e);
  process.exit(1);
});
  const raw = String(process.env.DEPOSIT_PENDING_CREDIT ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function ensurePendingCreditSchema(sql: ReturnType<typeof getSql>) {
  const rows = await sql<{ has_status: boolean; has_hold_id: boolean }[]>`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ex_chain_deposit_event'
          AND column_name = 'status'
      ) AS has_status,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ex_chain_deposit_event'
          AND column_name = 'hold_id'
      ) AS has_hold_id
  `;

  const has = rows[0];
  if (!has?.has_status || !has?.has_hold_id) {
    throw new Error(
      "Pending deposit credit is enabled but schema is missing. Apply db/migrations/044_deposit_pending_hold.sql (ex_chain_deposit_event.status/hold_id).",
    );
  }
}

function isWatchMode(): boolean {
  const raw = String(process.env.DEPOSIT_SCAN_WATCH ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function getPollIntervalMs(): number {
  const raw = Number.parseInt(process.env.DEPOSIT_SCAN_POLL_MS ?? "10000", 10);
  if (!Number.isFinite(raw) || raw < 1000) return 10000;
  return Math.min(300000, raw);
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

async function beat(sql: ReturnType<typeof getSql>, chain: "bsc" | "eth", details?: Record<string, unknown>) {
  try {
    await upsertServiceHeartbeat(sql, {
      service: heartbeatServiceName(chain),
      status: "ok",
      details: {
        chain,
        confirmations: getConfirmations(),
        chunk: getBlockChunkSize(),
        ...(details ?? {}),
      },
    });
  } catch {
    // ignore
  }
}

type DepositAddressRow = { user_id: string; address: string };
type TokenAssetRow = { assetId: string; symbol: string; contract: string; decimals: number };

function depositEventKey(txHash: string, logIndex: number): string {
  return `${txHash.toLowerCase()}:${logIndex}`;
}

async function revertDepositEvent(sql: ReturnType<typeof getSql>, params: {
  chain: "bsc" | "eth";
  id: number;
  userId: string;
  assetId: string;
  assetSymbol: string;
  amount: string;
  txHash: string;
  logIndex: number;
  journalEntryId: string | null;
  holdId: string | null;
}) {
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    // Mark reverted once (idempotent).
    const updated = await txSql<{ id: number; status: string }[]>`
      UPDATE ex_chain_deposit_event
      SET status = 'reverted'
      WHERE id = ${params.id}
        AND status <> 'reverted'
      RETURNING id, status
    `;
    if (updated.length === 0) return;

    if (params.holdId) {
      await txSql`
        UPDATE ex_hold
        SET status = 'released', released_at = now()
        WHERE id = ${params.holdId}::uuid
          AND status = 'active'
      `;
    }

    // If we previously credited a ledger entry, post a compensating reversal.
    // Note: This can drive the account negative if funds were spent before the reorg was detected.
    if (params.journalEntryId) {
      await ensureSystemUser(txSql as any);

      const userAcct = await txSql<{ id: string }[]>`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${params.userId}::uuid, ${params.assetId}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `;

      const systemAcct = await txSql<{ id: string }[]>`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${SYSTEM_USER_ID}::uuid, ${params.assetId}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entryRows = await (txSql as any)<{ id: string }[]>`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'deposit_revert',
          ${`revert:${params.chain}:${params.txHash}:${params.logIndex}`},
          ${txSql.json({
            chain: params.chain,
            tx_hash: params.txHash,
            log_index: params.logIndex,
            asset: params.assetSymbol,
            asset_id: params.assetId,
            amount: params.amount,
            original_journal_entry_id: params.journalEntryId,
            reason: 'reorg_missing_log',
          })}::jsonb
        )
        RETURNING id
      `;

      const reversalEntryId = entryRows[0]!.id;

      // Reverse: debit user, credit system.
      await txSql`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${reversalEntryId}::uuid, ${userAcct[0]!.id}::uuid, ${params.assetId}::uuid, ((${params.amount}::numeric) * -1)),
          (${reversalEntryId}::uuid, ${systemAcct[0]!.id}::uuid, ${params.assetId}::uuid, (${params.amount}::numeric))
      `;
    }

    await createNotification(txSql as any, {
      userId: params.userId,
      type: "system",
      title: "Deposit reversed",
      body: `A recent ${params.assetSymbol} deposit was reversed due to a chain reorg.`,
      metadata: {
        chain: params.chain,
        txHash: params.txHash,
        logIndex: params.logIndex,
        asset: params.assetSymbol,
        amount: params.amount,
      },
    });
  });
}

async function detectAndHandleReorgs(sql: ReturnType<typeof getSql>, params: {
  chain: "bsc" | "eth";
  provider: ethers.JsonRpcProvider;
  depositAddrs: DepositAddressRow[];
  tokenAssets: TokenAssetRow[];
  currentBlock: number;
  confirmations: number;
}) {
  const window = Math.max(0, getReorgSafetyWindowBlocks());
  // Include confirmations buffer because those are exactly the blocks that may roll back.
  const lookback = Math.min(500, window + Math.max(0, params.confirmations) + 6);
  if (lookback <= 0) return;

  const fromBlock = Math.max(0, params.currentBlock - lookback);
  const toBlock = params.currentBlock;
  if (params.depositAddrs.length === 0 || params.tokenAssets.length === 0) return;

  const chainKeys = new Set<string>();
  for (const dep of params.depositAddrs) {
    const toTopic = toTopicAddress(dep.address);
    for (const tok of params.tokenAssets) {
      const logs = await getLogsWithRetry(params.provider, {
        address: tok.contract,
        fromBlock,
        toBlock,
        topics: [TRANSFER_TOPIC, null, toTopic],
      }).catch(() => []);

      for (const log of logs) {
        chainKeys.add(depositEventKey(log.transactionHash, log.index));
      }
    }
  }

  const dbEvents = await sql<
    {
      id: number;
      tx_hash: string;
      log_index: number;
      user_id: string;
      asset_id: string;
      amount: string;
      journal_entry_id: string | null;
      hold_id: string | null;
      symbol: string;
      status: string;
    }[]
  >`
    SELECT
      e.id,
      e.tx_hash,
      e.log_index,
      e.user_id::text AS user_id,
      e.asset_id::text AS asset_id,
      e.amount::text AS amount,
      e.journal_entry_id::text AS journal_entry_id,
      e.hold_id::text AS hold_id,
      a.symbol,
      e.status
    FROM ex_chain_deposit_event e
    JOIN ex_asset a ON a.id = e.asset_id
    WHERE e.chain = ${params.chain}
      AND e.block_number BETWEEN ${fromBlock} AND ${toBlock}
      AND e.status <> 'reverted'
  `;

  let reverted = 0;
  for (const ev of dbEvents) {
    const k = depositEventKey(ev.tx_hash, ev.log_index);
    if (chainKeys.has(k)) continue;
    reverted += 1;
    await revertDepositEvent(sql, {
      chain: params.chain,
      id: ev.id,
      userId: ev.user_id,
      assetId: ev.asset_id,
      assetSymbol: String(ev.symbol ?? "").toUpperCase(),
      amount: ev.amount,
      txHash: ev.tx_hash,
      logIndex: ev.log_index,
      journalEntryId: ev.journal_entry_id,
      holdId: ev.hold_id,
    });
  }

  if (reverted > 0) {
    console.log(`[deposit-scan] reorg check reverted=${reverted} range=${fromBlock}..${toBlock}`);
  }
}

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

async function runOnce(sql: ReturnType<typeof getSql>, chain: "bsc" | "eth", provider: ethers.JsonRpcProvider) {
  const confirmations = getConfirmations();
  const rpcUrl = getRpcUrlForLog(chain);
  console.log(`[deposit-scan] iteration start chain=${chain} confirmations=${confirmations} rpc=${rpcUrl}`);
  await beat(sql, chain, { event: "start_once", chain, confirmations });

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

  const pendingEnabled = isPendingCreditEnabled();
  if (pendingEnabled) {
    await ensurePendingCreditSchema(sql);
  }

  if (fromBlock > safeToBlock && !pendingEnabled) {
    console.log(`[deposit-scan] nothing to do fromBlock=${fromBlock} safeToBlock=${safeToBlock}`);
    await beat(sql, chain, { event: "noop", fromBlock, safeToBlock });
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

  const ranges: Array<{ label: "confirmed" | "pending"; from: number; to: number }> = [];
  if (fromBlock <= safeToBlock) {
    ranges.push({ label: "confirmed", from: fromBlock, to: safeToBlock });
  }
  if (pendingEnabled && safeToBlock + 1 <= currentBlock) {
    ranges.push({ label: "pending", from: Math.max(fromBlock, safeToBlock + 1), to: currentBlock });
  }

  for (const dep of depositAddrs) {
    const toTopic = toTopicAddress(dep.address);

    for (const tok of tokenAssets) {
      for (const range of ranges) {
        const logs: ethers.Log[] = [];
        let fallbackUsed = false;

        for (let chunkFrom = range.from; chunkFrom <= range.to; chunkFrom += blockChunk) {
          const chunkTo = Math.min(range.to, chunkFrom + blockChunk - 1);
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
            if (range.label === "confirmed") {
              fallbackUsed = true;
              console.log(
                `[deposit-scan] falling back to on-chain balance delta for ${tok.symbol} -> ${dep.address}`,
              );
            }
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
          const from = (log.topics[1]
            ? ethers.getAddress(ethers.dataSlice(log.topics[1], 12))
            : null
          )?.toLowerCase() ?? null;

          const value = ethers.toBigInt(log.data);
          if (value <= 0n) continue;
          const amount = ethers.formatUnits(value, tok.decimals);

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

          const creditPending = pendingEnabled && range.label === "pending";

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
                ${`${chain}:${txHash}:${logIndex}`},
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

            let holdId: string | null = null;
            if (creditPending) {
              const holdRows = await txSql<{ id: string }[]>`
                INSERT INTO ex_hold (account_id, asset_id, amount, reason)
                VALUES (
                  ${userAcct[0]!.id}::uuid,
                  ${tok.assetId}::uuid,
                  (${amount}::numeric),
                  ${`deposit_pending:${chain}:${txHash}:${logIndex}`}
                )
                RETURNING id
              `;
              holdId = holdRows[0]!.id;
            }

            await txSql`
              UPDATE ex_chain_deposit_event
              SET journal_entry_id = ${entryId}::uuid,
                  credited_at = now(),
                  status = ${creditPending ? "pending" : "confirmed"},
                  confirmed_at = CASE WHEN ${creditPending} THEN NULL ELSE now() END,
                  hold_id = ${holdId}::uuid
              WHERE id = ${inserted[0]!.id}
            `;

            await createNotification(txSql, {
              userId: dep.user_id,
              type: "deposit_credited",
              title: creditPending ? "Deposit received" : "Deposit credited",
              body: creditPending
                ? `Deposit detected: ${amount} ${tok.symbol}. Funds will unlock after confirmations.`
                : `Your deposit of ${amount} ${tok.symbol} has been credited to your ${tok.symbol} balance.`,
              metadata: { chain, txHash, logIndex, asset: tok.symbol, amount, status: creditPending ? "pending" : "confirmed" },
            });
          });

          credited++;
        }
      }
    }
  }

  if (pendingEnabled) {
    const toFinalize = await sql<{ id: number; hold_id: string | null }[]>`
      SELECT id, hold_id::text AS hold_id
      FROM ex_chain_deposit_event
      WHERE chain = ${chain}
        AND status = 'pending'
        AND block_number <= ${safeToBlock}
    `;

    for (const row of toFinalize) {
      await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        if (row.hold_id) {
          await txSql`
            UPDATE ex_hold
            SET status = 'released', released_at = now()
            WHERE id = ${row.hold_id}::uuid
              AND status = 'active'
          `;
        }

        await txSql`
          UPDATE ex_chain_deposit_event
          SET status = 'confirmed', confirmed_at = now()
          WHERE id = ${row.id}
            AND status = 'pending'
        `;
      });
    }

    // Reorg safety: verify recent blocks still contain the logs we previously recorded.
    // If a log disappears due to a chain reorg, reverse the credit and release any holds.
    await detectAndHandleReorgs(sql, {
      chain,
      provider,
      depositAddrs,
      tokenAssets,
      currentBlock,
      confirmations,
    });
  }

  await sql`
    INSERT INTO ex_chain_deposit_cursor (chain, last_scanned_block)
    VALUES (${chain}, ${safeToBlock})
    ON CONFLICT (chain) DO UPDATE
      SET last_scanned_block = GREATEST(ex_chain_deposit_cursor.last_scanned_block, EXCLUDED.last_scanned_block),
          updated_at = now()
  `;

  console.log(
    `[deposit-scan] done seenEvents=${seenEvents} credited=${credited} fallbackCredits=${fallbackCredits} advancedTo=${safeToBlock}`,
  );

  await beat(sql, chain, {
    event: "done",
    seenEvents,
    credited,
    fallbackCredits,
    advancedTo: safeToBlock,
  });
  await beat(sql, chain, {
    event: "done_once",
    seenEvents,
    credited,
    fallbackCredits,
    advancedTo: safeToBlock,
  });
}

async function main() {
  const sql = getSql();
  const chain = getScanChain();
  const provider = getProvider(chain);

  await beat(sql, chain, { event: isWatchMode() ? "start_watch" : "start" });

  if (!isWatchMode()) {
    try {
      await runOnce(sql, chain, provider);
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }

  const pollMs = getPollIntervalMs();
  console.log(`[deposit-scan] watch mode enabled chain=${chain} pollMs=${pollMs}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce(sql, chain, provider);
    } catch (e) {
      console.error("[deposit-scan] iteration error:", e);
      await beat(sql, chain, { event: "error", message: String((e as any)?.message ?? e) });
    }

    await sleep(pollMs);
  }
}

main().catch((e) => {
  console.error("[deposit-scan] fatal:", e);
  process.exit(1);
});
