import { ethers } from "ethers";
import type { Sql } from "postgres";

import { getBscProvider } from "@/lib/blockchain/wallet";
import { createNotification } from "@/lib/notifications";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

let _depositEventCols:
  | null
  | {
      hasStatus: boolean;
      hasCreditedAt: boolean;
      hasConfirmedAt: boolean;
    } = null;

async function getDepositEventCols(sql: Sql): Promise<{
  hasStatus: boolean;
  hasCreditedAt: boolean;
  hasConfirmedAt: boolean;
}> {
  if (_depositEventCols) return _depositEventCols;

  const rows = await sql<
    {
      has_status: boolean;
      has_credited_at: boolean;
      has_confirmed_at: boolean;
    }[]
  >`
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
          AND column_name = 'credited_at'
      ) AS has_credited_at,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ex_chain_deposit_event'
          AND column_name = 'confirmed_at'
      ) AS has_confirmed_at
  `;

  const row = rows[0];
  _depositEventCols = {
    hasStatus: Boolean(row?.has_status),
    hasCreditedAt: Boolean(row?.has_credited_at),
    hasConfirmedAt: Boolean(row?.has_confirmed_at),
  };
  return _depositEventCols;
}

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function chunk<T>(items: T[], size: number): T[][] {
  const s = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += s) out.push(items.slice(i, i + s));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms))));
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("triggered rate limit") ||
    lower.includes("-32005")
  );
}

function isUnsupportedArrayParamError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("invalid params") &&
    (lower.includes("variadic") || lower.includes("array type") || lower.includes("invalid variadic"))
  );
}

function isUnsupportedTopicsShapeError(err: unknown): boolean {
  // Some RPC providers reject `topics` arrays that include `null` placeholders
  // or mixed (string|null|array) entries, despite being valid per JSON-RPC.
  // We treat these similarly and fall back to `topics: [topic0]`.
  return isUnsupportedArrayParamError(err);
}

function isBlockRangeTooLargeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("block range is too large") ||
    lower.includes("range is too large") ||
    lower.includes("block range too large") ||
    lower.includes("fromblock") && lower.includes("toblock") && lower.includes("too large")
  );
}

async function getLogsRangeSafe(
  provider: ethers.JsonRpcProvider,
  filter: Omit<ethers.Filter, "fromBlock" | "toBlock"> & { fromBlock: number; toBlock: number },
  opts?: { maxDepth?: number },
): Promise<ethers.Log[]> {
  const maxDepth = clamp(opts?.maxDepth ?? 12, 4, 24);

  const walk = async (fromBlock: number, toBlock: number, depth: number): Promise<ethers.Log[]> => {
    try {
      return await getLogsWithRetry(provider, { ...filter, fromBlock, toBlock }, { maxAttempts: 6, baseDelayMs: 800 });
    } catch (e) {
      if (!isBlockRangeTooLargeError(e) || fromBlock >= toBlock || depth >= maxDepth) throw e;
      const mid = Math.floor((fromBlock + toBlock) / 2);
      // Split sequentially to avoid fanning out too many concurrent RPC calls
      // (which can cause rate limiting or edge timeouts in serverless contexts).
      const a = await walk(fromBlock, mid, depth + 1);
      const b = await walk(mid + 1, toBlock, depth + 1);
      return a.concat(b);
    }
  };

  return await walk(filter.fromBlock, filter.toBlock, 0);
}

function coerceTopicsForCompatibility(topics: (string | string[] | null)[]): (string | string[] | null)[] {
  // Some RPC providers are picky about “OR” arrays with a single element.
  // Coerce ["0x..."] -> "0x...".
  return topics.map((t) => {
    if (Array.isArray(t) && t.length === 1) return t[0] ?? null;
    return t;
  });
}

async function getLogsWithRetry(
  provider: ethers.JsonRpcProvider,
  args: ethers.Filter,
  opts?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<ethers.Log[]> {
  const maxAttempts = clamp(opts?.maxAttempts ?? 4, 1, 8);
  const baseDelayMs = clamp(opts?.baseDelayMs ?? 500, 50, 10_000);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await provider.getLogs(args);
    } catch (e) {
      lastErr = e;
      if (!isRateLimitError(e) || attempt === maxAttempts) throw e;
      // Exponential backoff with small jitter.
      const jitter = Math.floor(Math.random() * 150);
      const delay = baseDelayMs * attempt * attempt + jitter;
      await sleep(delay);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function getLogsBatchedOrSplit(
  provider: ethers.JsonRpcProvider,
  args: {
    addresses: string[];
    fromBlock: number;
    toBlock: number;
    topics: (string | string[] | null)[];
  },
): Promise<ethers.Log[]> {
  const throttleMs = clamp(envInt("BSC_DEPOSIT_LOG_THROTTLE_MS", 0), 0, 10_000);
  const topics = coerceTopicsForCompatibility(args.topics);
  const topic0 = typeof topics[0] === "string" ? (topics[0] as string) : null;

  const filterBase = {
    fromBlock: args.fromBlock,
    toBlock: args.toBlock,
    topics,
  } as const;

  // Fast path: try a single batched query (address array) if supported.
  try {
    const logs = await getLogsRangeSafe(provider, {
      ...filterBase,
      address: args.addresses,
    } as any);
    if (throttleMs) await sleep(throttleMs);
    return logs;
  } catch (e) {
    // Some providers (notably Ankr) reject address arrays for eth_getLogs.
    // In that case, fall back to single-contract calls.
    if (!isRateLimitError(e) && !isUnsupportedArrayParamError(e)) {
      // Another common incompatibility: reject complex topics shapes.
      if (topic0 && isUnsupportedTopicsShapeError(e)) {
        try {
          const logs = await getLogsRangeSafe(provider, {
            fromBlock: args.fromBlock,
            toBlock: args.toBlock,
            address: args.addresses,
            topics: [topic0],
          } as any);
          if (throttleMs) await sleep(throttleMs);
          return logs;
        } catch (e2) {
          if (!isRateLimitError(e2) && !isUnsupportedArrayParamError(e2)) throw e2;
          // Continue to split fallback.
        }
      } else {
        throw e;
      }
    }
  }

  // Slow path: split per contract. Many public RPCs rate-limit batched/array address calls.
  const out: ethers.Log[] = [];
  for (const addr of args.addresses) {
    if (!addr) continue;
    let logs: ethers.Log[];
    try {
      logs = await getLogsRangeSafe(provider, {
        ...filterBase,
        address: addr,
      } as any);
    } catch (e) {
      if (!topic0 || !isUnsupportedTopicsShapeError(e)) throw e;
      // Retry with only the event signature topic.
      logs = await getLogsRangeSafe(provider, {
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
        address: addr,
        topics: [topic0],
      } as any);
    }
    out.push(...logs);
    if (throttleMs) await sleep(throttleMs);
  }
  return out;
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

function encodeTopicAddress(addr: string): string {
  const a = normalizeAddress(addr);
  if (!a.startsWith("0x") || a.length !== 42) return "0x" + "0".repeat(64);
  // 32-byte topic, right-aligned address (last 20 bytes)
  return "0x" + "0".repeat(24 * 2) + a.slice(2);
}

type DepositAsset = {
  id: string;
  symbol: string;
  decimals: number;
  contract_address: string;
};

type NativeAsset = {
  id: string;
  symbol: string;
  decimals: number;
};

function parseSymbolAllowlist(raw: string, fallback: string[]): string[] {
  const out = String(raw || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return out.length ? out : fallback;
}

export async function ingestNativeBnbDepositTx(
  sql: Sql,
  args: {
    chain?: "bsc";
    txHash: string;
    confirmations?: number;
  },
): Promise<
  | {
      ok: true;
      chain: "bsc";
      txHash: string;
      blockNumber: number;
      confirmations: number;
      safeTip: number;
      toAddress: string;
      userId: string;
      assetSymbol: "BNB";
      amount: string;
      outcome: "credited" | "duplicate";
    }
  | {
      ok: false;
      error:
        | "tx_not_found"
        | "tx_not_confirmed"
        | "tx_failed"
        | "not_a_native_transfer"
        | "unknown_deposit_address"
        | "bnb_asset_missing";
      txHash: string;
      details?: any;
    }
> {
  const provider = getBscProvider();
  const chain: "bsc" = args.chain ?? "bsc";

  const confirmations = clamp(args.confirmations ?? envInt("BSC_DEPOSIT_CONFIRMATIONS", 2), 0, 200);
  const tip = await provider.getBlockNumber();
  const safeTip = Math.max(0, tip - confirmations);

  const txHash = String(args.txHash || "").trim();
  if (!txHash.startsWith("0x") || txHash.length < 10) {
    return { ok: false, error: "tx_not_found", txHash };
  }

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return { ok: false, error: "tx_not_found", txHash };
  const blockNumber = Number(receipt.blockNumber);
  if (!Number.isFinite(blockNumber) || blockNumber <= 0) {
    return { ok: false, error: "tx_not_found", txHash, details: { blockNumber: receipt.blockNumber } };
  }

  if (blockNumber > safeTip) {
    return {
      ok: false,
      error: "tx_not_confirmed",
      txHash,
      details: { blockNumber, tip, safeTip, confirmations },
    };
  }

  if (typeof receipt.status === "number" && receipt.status !== 1) {
    return { ok: false, error: "tx_failed", txHash, details: { status: receipt.status } };
  }

  const tx = await provider.getTransaction(txHash);
  if (!tx) return { ok: false, error: "tx_not_found", txHash };

  const toAddress = tx.to ? normalizeAddress(tx.to) : "";
  const value = tx.value ?? 0n;
  if (!toAddress || typeof value !== "bigint" || value <= 0n) {
    return {
      ok: false,
      error: "not_a_native_transfer",
      txHash,
      details: { to: tx.to, value: String(value) },
    };
  }

  const rows = await sql<{ user_id: string }[]>`
    SELECT user_id::text AS user_id
    FROM ex_deposit_address
    WHERE chain = ${chain} AND status = 'active' AND lower(address) = ${toAddress}
    LIMIT 1
  `;
  const userId = rows[0]?.user_id ? String(rows[0].user_id) : "";
  if (!userId) {
    return { ok: false, error: "unknown_deposit_address", txHash, details: { toAddress } };
  }

  const nativeRows = await sql<NativeAsset[]>`
    SELECT id::text AS id, symbol, decimals
    FROM ex_asset
    WHERE chain = ${chain}
      AND is_enabled = true
      AND contract_address IS NULL
      AND upper(symbol) = 'BNB'
    LIMIT 1
  `;
  const nativeBnb = nativeRows[0] ?? null;
  if (!nativeBnb) return { ok: false, error: "bnb_asset_missing", txHash };

  const amount = ethers.formatUnits(value, nativeBnb.decimals);
  const cols = await getDepositEventCols(sql);
  const outcome = await creditDepositEvent(sql as any, {
    chain,
    txHash,
    logIndex: -1,
    blockNumber,
    fromAddress: tx.from ? normalizeAddress(tx.from) : null,
    toAddress,
    userId,
    assetId: nativeBnb.id,
    assetSymbol: nativeBnb.symbol,
    amount,
    cols,
  });

  return {
    ok: true,
    chain,
    txHash,
    blockNumber,
    confirmations,
    safeTip,
    toAddress,
    userId,
    assetSymbol: "BNB",
    amount,
    outcome,
  };
}

export async function ingestBscTokenDepositTx(
  sql: Sql,
  args: {
    txHash: string;
    userId: string;
    depositAddress: string;
    confirmations?: number;
    tokenSymbols?: string[];
  },
): Promise<
  | {
      ok: true;
      chain: "bsc";
      txHash: string;
      blockNumber: number;
      confirmations: number;
      safeTip: number;
      depositAddress: string;
      matches: number;
      credits: Array<{
        assetSymbol: string;
        amount: string;
        logIndex: number;
        outcome: "credited" | "duplicate";
      }>;
    }
  | {
      ok: false;
      error:
        | "tx_not_found"
        | "tx_not_confirmed"
        | "tx_failed"
        | "no_matching_token_transfers"
        | "token_asset_not_enabled";
      txHash: string;
      details?: any;
    }
> {
  const provider = getBscProvider();
  const chain: "bsc" = "bsc";

  const confirmations = clamp(args.confirmations ?? envInt("BSC_DEPOSIT_CONFIRMATIONS", 2), 0, 200);
  const tip = await provider.getBlockNumber();
  const safeTip = Math.max(0, tip - confirmations);

  const txHash = String(args.txHash || "").trim();
  if (!txHash.startsWith("0x") || txHash.length < 10) {
    return { ok: false, error: "tx_not_found", txHash };
  }

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return { ok: false, error: "tx_not_found", txHash };

  const blockNumber = Number(receipt.blockNumber);
  if (!Number.isFinite(blockNumber) || blockNumber <= 0) {
    return { ok: false, error: "tx_not_found", txHash, details: { blockNumber: receipt.blockNumber } };
  }

  if (blockNumber > safeTip) {
    return {
      ok: false,
      error: "tx_not_confirmed",
      txHash,
      details: { blockNumber, tip, safeTip, confirmations },
    };
  }

  if (typeof receipt.status === "number" && receipt.status !== 1) {
    return { ok: false, error: "tx_failed", txHash, details: { status: receipt.status } };
  }

  const depositAddress = normalizeAddress(args.depositAddress);
  if (!depositAddress || !depositAddress.startsWith("0x") || depositAddress.length !== 42) {
    return { ok: false, error: "no_matching_token_transfers", txHash, details: { depositAddress } };
  }

  const allowSymbols = (args.tokenSymbols ?? []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);
  const symbols = allowSymbols.length
    ? allowSymbols
    : parseSymbolAllowlist(process.env.BSC_REPORT_TOKEN_SYMBOLS ?? "", ["USDT", "USDC"]);

  const assets = await sql<DepositAsset[]>`
    SELECT id::text AS id, symbol, decimals, contract_address
    FROM ex_asset
    WHERE chain = ${chain}
      AND is_enabled = true
      AND contract_address IS NOT NULL
      AND upper(symbol) = ANY(${symbols})
    ORDER BY symbol ASC
  `;

  if (assets.length === 0) {
    return { ok: false, error: "token_asset_not_enabled", txHash, details: { symbols } };
  }

  const contractToAsset = new Map<string, DepositAsset>();
  for (const a of assets) {
    const c = normalizeAddress(a.contract_address);
    if (c) contractToAsset.set(c, a);
  }

  const cols = await getDepositEventCols(sql);
  const transferTopic = ethers.id("Transfer(address,address,uint256)");

  const credits: Array<{ assetSymbol: string; amount: string; logIndex: number; outcome: "credited" | "duplicate" }> = [];
  let matches = 0;

  const logs = Array.isArray((receipt as any).logs) ? ((receipt as any).logs as Array<any>) : [];
  for (const log of logs) {
    const topics: string[] = Array.isArray(log?.topics) ? log.topics : [];
    if (!topics?.length) continue;
    if (String(topics[0]).toLowerCase() !== transferTopic.toLowerCase()) continue;

    const to = decodeTopicAddress(topics?.[2] ?? "");
    if (!to || to !== depositAddress) continue;

    const contract = normalizeAddress(String(log?.address ?? ""));
    const asset = contractToAsset.get(contract);
    if (!asset) continue;

    const from = decodeTopicAddress(topics?.[1] ?? "") || null;
    let amountRaw: bigint;
    try {
      amountRaw = BigInt(String(log?.data ?? "0x0"));
    } catch {
      continue;
    }
    if (amountRaw <= 0n) continue;

    const amount = ethers.formatUnits(amountRaw, asset.decimals);
    const logIndex = Number((log as any)?.index ?? (log as any)?.logIndex ?? (log as any)?.log_index ?? 0);

    matches += 1;
    const outcome = await creditDepositEvent(sql as any, {
      chain,
      txHash,
      logIndex,
      blockNumber,
      fromAddress: from,
      toAddress: to,
      userId: args.userId,
      assetId: asset.id,
      assetSymbol: asset.symbol,
      amount,
      cols,
    });

    credits.push({ assetSymbol: asset.symbol, amount, logIndex, outcome });
  }

  if (matches === 0) {
    return {
      ok: false,
      error: "no_matching_token_transfers",
      txHash,
      details: { depositAddress, symbols },
    };
  }

  return {
    ok: true,
    chain,
    txHash,
    blockNumber,
    confirmations,
    safeTip,
    depositAddress,
    matches,
    credits,
  };
}

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
    cols?: { hasStatus: boolean; hasCreditedAt: boolean; hasConfirmedAt: boolean };
  },
): Promise<"credited" | "duplicate"> {
  // Idempotency is provided by ex_chain_deposit_event_uniq (chain, tx_hash, log_index).
  // However, we also support a two-stage flow:
  // - Stage A: record the deposit event as "seen" (journal_entry_id NULL)
  // - Stage B: later credit it once confirmations are met
  //
  // So, if the row already exists but has no journal_entry_id, we still proceed to credit.
  return await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    const inserted = await txSql<{ id: number }[]>`
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

    let eventId: number | null = inserted[0]?.id ?? null;
    let alreadyCredited = false;

    if (!eventId) {
      const existing = await txSql<
        { id: number; journal_entry_id: string | null }[]
      >`
        SELECT id, journal_entry_id
        FROM ex_chain_deposit_event
        WHERE chain = ${args.chain}
          AND tx_hash = ${args.txHash}
          AND log_index = ${args.logIndex}
        FOR UPDATE
        LIMIT 1
      `;

      if (existing.length === 0) {
        // Extremely rare: concurrent delete or schema issue. Treat as duplicate.
        return "duplicate";
      }

      eventId = Number(existing[0]!.id);
      alreadyCredited = Boolean(existing[0]!.journal_entry_id);
      if (alreadyCredited) return "duplicate";

      // Ensure the existing row reflects the final resolved attribution.
      // (If it was inserted earlier as "seen", we still want the authoritative values.)
      await txSql`
        UPDATE ex_chain_deposit_event
        SET
          block_number = ${args.blockNumber},
          from_address = ${args.fromAddress},
          to_address = ${args.toAddress},
          user_id = ${args.userId}::uuid,
          asset_id = ${args.assetId}::uuid,
          amount = (${args.amount}::numeric)
        WHERE id = ${eventId}
      `;
    }

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

    // Optional bookkeeping columns (added by later migrations).
    if (args.cols?.hasStatus) {
      await txSql`
        UPDATE ex_chain_deposit_event
        SET status = 'confirmed'
        WHERE chain = ${args.chain}
          AND tx_hash = ${args.txHash}
          AND log_index = ${args.logIndex}
      `;
    }
    if (args.cols?.hasCreditedAt) {
      await txSql`
        UPDATE ex_chain_deposit_event
        SET credited_at = coalesce(credited_at, now())
        WHERE chain = ${args.chain}
          AND tx_hash = ${args.txHash}
          AND log_index = ${args.logIndex}
      `;
    }
    if (args.cols?.hasConfirmedAt) {
      await txSql`
        UPDATE ex_chain_deposit_event
        SET confirmed_at = coalesce(confirmed_at, now())
        WHERE chain = ${args.chain}
          AND tx_hash = ${args.txHash}
          AND log_index = ${args.logIndex}
      `;
    }

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

async function recordDepositEventSeen(
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
    amount: string;
    cols?: { hasStatus: boolean };
  },
): Promise<"inserted" | "exists"> {
  const inserted = await sql<{ id: number }[]>`
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

  const outcome = inserted.length > 0 ? "inserted" : "exists";

  if (args.cols?.hasStatus) {
    // Only mark as seen if it hasn't been credited/confirmed yet.
    await sql`
      UPDATE ex_chain_deposit_event
      SET status = 'seen'
      WHERE chain = ${args.chain}
        AND tx_hash = ${args.txHash}
        AND log_index = ${args.logIndex}
        AND journal_entry_id IS NULL
        AND (status IS NULL OR status <> 'confirmed')
    `;
  }

  return outcome;
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
    DO UPDATE SET
      last_scanned_block = GREATEST(ex_chain_deposit_cursor.last_scanned_block, EXCLUDED.last_scanned_block),
      updated_at = now()
  `;
}

export async function scanAndCreditBscDeposits(
  sql: Sql,
  opts?: {
    fromBlock?: number;
    maxBlocks?: number;
    confirmations?: number;
    blocksPerBatch?: number;
    maxMs?: number;
    scanNative?: boolean;
    scanTokens?: boolean;
    tokenSymbols?: string[];
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
  scanNative: boolean;
  scanTokens: boolean;
  checkedLogs: number;
  matchedDeposits: number;
  credited: number;
  duplicates: number;
  pendingSeen?: number;
  stoppedEarly?: boolean;
  stopReason?: "time_budget";
}> {
  const provider = getBscProvider();
  const chain: "bsc" = "bsc";

  const cols = await getDepositEventCols(sql);

  const confirmations = clamp(opts?.confirmations ?? envInt("BSC_DEPOSIT_CONFIRMATIONS", 2), 0, 200);
  const blocksPerBatch = clamp(opts?.blocksPerBatch ?? envInt("BSC_DEPOSIT_BLOCKS_PER_BATCH", 1200), 10, 10_000);
  const maxBlocks = clamp(opts?.maxBlocks ?? envInt("BSC_DEPOSIT_MAX_BLOCKS_PER_RUN", 15_000), 10, 200_000);

  const maxMs = clamp(opts?.maxMs ?? envInt("BSC_DEPOSIT_MAX_MS", 0), 0, 5 * 60_000);
  const startedAtMs = Date.now();

  const scanNative = opts?.scanNative ?? true;
  const scanTokens = opts?.scanTokens ?? true;
  const tokenSymbols = (opts?.tokenSymbols ?? []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);

  const tip = await provider.getBlockNumber();
  const safeTip = Math.max(0, tip - confirmations);

  const cursor = await getOrInitCursor(sql, chain);
  const startFromCursor = cursor + 1;
  // If the cursor is brand new (0) and the caller didn't specify a fromBlock,
  // start at the safe tip to avoid an accidental genesis-to-tip backfill.
  const defaultFrom = cursor === 0 && typeof opts?.fromBlock !== "number" ? safeTip : startFromCursor;
  const fromBlock = Math.max(0, Math.min(safeTip, opts?.fromBlock ?? defaultFrom));
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
      scanNative,
      scanTokens,
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

  // If we have no addresses to watch, don't hammer the RPC provider.
  // Still advance the cursor so subsequent runs start from a recent block.
  if (addressToUser.size === 0) {
    await updateCursor(sql, chain, toBlock);
    return {
      ok: true,
      chain,
      fromBlock,
      toBlock,
      tip,
      confirmations,
      batches: 0,
      assets: 0,
      scanNative,
      scanTokens,
      checkedLogs: 0,
      matchedDeposits: 0,
      credited: 0,
      duplicates: 0,
    };
  }

  const tokenAssets = scanTokens
    ? await sql<DepositAsset[]>`
        SELECT id::text AS id, symbol, decimals, contract_address
        FROM ex_asset
        WHERE chain = ${chain}
          AND is_enabled = true
          AND contract_address IS NOT NULL
          AND (${tokenSymbols.length === 0}::boolean OR upper(symbol) = ANY(${tokenSymbols}))
        ORDER BY symbol ASC
      `
    : ([] as DepositAsset[]);

  // Native BNB support (direct transfers). This does NOT require traces;
  // it covers the common “send BNB to address” case. Internal transfers
  // (contract sends) require trace APIs and are handled separately.
  const nativeBnb = scanNative
    ? (
        (
          await sql<NativeAsset[]>`
            SELECT id::text AS id, symbol, decimals
            FROM ex_asset
            WHERE chain = ${chain}
              AND is_enabled = true
              AND contract_address IS NULL
              AND upper(symbol) = 'BNB'
            LIMIT 1
          `
        )[0] ?? null
      )
    : null;

  // ── Pending-detection (native BNB only) ─────────────────────────
  // Record recent deposits immediately ("seen") so the wallet can show
  // pending confirmations even before crediting occurs.
  //
  // We intentionally keep this lightweight (small lookback, native only).
  const pendingLookback = clamp(envInt("BSC_DEPOSIT_PENDING_LOOKBACK_BLOCKS", 60), 0, 500);
  let pendingSeen = 0;
  if (nativeBnb && pendingLookback > 0 && safeTip < tip) {
    const pendingFrom = Math.max(safeTip + 1, tip - pendingLookback + 1);
    const pendingTo = tip;
    for (let blockNo = pendingFrom; blockNo <= pendingTo; blockNo += 1) {
      if (maxMs > 0 && Date.now() - startedAtMs > maxMs) {
        break;
      }

      const block = await provider.getBlock(blockNo, true);
      if (!block) continue;

      const txs = Array.isArray((block as any).transactions) ? ((block as any).transactions as ethers.TransactionResponse[]) : [];
      for (const tx of txs) {
        const to = tx.to ? normalizeAddress(tx.to) : "";
        if (!to) continue;
        const userId = addressToUser.get(to);
        if (!userId) continue;

        const value = tx.value ?? 0n;
        if (typeof value !== "bigint" || value <= 0n) continue;

        const amount = ethers.formatUnits(value, nativeBnb.decimals);
        const out = await recordDepositEventSeen(sql as any, {
          chain,
          txHash: String(tx.hash),
          logIndex: -1,
          blockNumber: Number(block.number),
          fromAddress: tx.from ? normalizeAddress(tx.from) : null,
          toAddress: to,
          userId,
          assetId: nativeBnb.id,
          amount,
          cols,
        });

        if (out === "inserted") pendingSeen += 1;
      }
    }
  }

  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const toTopicChunkSize = clamp(envInt("BSC_DEPOSIT_TO_TOPIC_CHUNK", 20), 1, 200);

  // Precompute watched-address topic chunks once per scan run.
  const toTopicChunksAll = scanTokens
    ? chunk(Array.from(addressToUser.keys()).map(encodeTopicAddress), toTopicChunkSize)
    : [];

  let batches = 0;
  let checkedLogs = 0;
  let matchedDeposits = 0;
  let credited = 0;
  let duplicates = 0;

  let stoppedEarly = false;
  let stopReason: "time_budget" | undefined;

  for (let start = fromBlock; start <= toBlock; start += blocksPerBatch) {
    if (maxMs > 0 && Date.now() - startedAtMs > maxMs) {
      stoppedEarly = true;
      stopReason = "time_budget";
      break;
    }

    const end = Math.min(toBlock, start + blocksPerBatch - 1);
    batches += 1;

    if (nativeBnb) {
      for (let blockNo = start; blockNo <= end; blockNo += 1) {
        const block = await provider.getBlock(blockNo, true);
        if (!block) continue;

        const txs = Array.isArray((block as any).transactions) ? ((block as any).transactions as ethers.TransactionResponse[]) : [];
        for (const tx of txs) {
          const to = tx.to ? normalizeAddress(tx.to) : "";
          if (!to) continue;
          const userId = addressToUser.get(to);
          if (!userId) continue;

          const value = tx.value ?? 0n;
          if (typeof value !== "bigint" || value <= 0n) continue;

          matchedDeposits += 1;
          const amount = ethers.formatUnits(value, nativeBnb.decimals);

          // Use log_index = -1 to avoid collisions with ERC20 log indexes (0..N) for the same tx hash.
          const outcome = await creditDepositEvent(sql as any, {
            chain,
            txHash: String(tx.hash),
            logIndex: -1,
            blockNumber: Number(block.number),
            fromAddress: tx.from ? normalizeAddress(tx.from) : null,
            toAddress: to,
            userId,
            assetId: nativeBnb.id,
            assetSymbol: nativeBnb.symbol,
            amount,
            cols,
          });

          if (outcome === "credited") credited += 1;
          else duplicates += 1;
        }
      }
    }

    if (!scanTokens) {
      await updateCursor(sql, chain, end);
      continue;
    }

    const addressChunkSize = clamp(envInt("BSC_DEPOSIT_LOG_ADDRESS_CHUNK", 25), 5, 250);
    const contractToAsset = new Map<string, DepositAsset>();
    for (const asset of tokenAssets) {
      const contract = normalizeAddress(asset.contract_address);
      if (!contract) continue;
      contractToAsset.set(contract, asset);
    }

    const contractChunks = chunk(Array.from(contractToAsset.keys()), addressChunkSize);
    for (const contracts of contractChunks) {
      if (!contracts.length) continue;

      for (const toTopics of toTopicChunksAll) {
        if (!toTopics.length) continue;

        const logs = await getLogsBatchedOrSplit(provider, {
          addresses: contracts,
          fromBlock: start,
          toBlock: end,
          // Filter by recipient to avoid fetching *all* transfers for the token.
          // topics[2] is `to` in the Transfer event.
          topics: [transferTopic, null, toTopics],
        });

        checkedLogs += logs.length;

        for (const log of logs) {
          const asset = contractToAsset.get(normalizeAddress(String((log as any)?.address ?? "")));
          if (!asset) continue;

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
            cols,
          });

          if (outcome === "credited") credited += 1;
          else duplicates += 1;
        }
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
    assets: tokenAssets.length + (nativeBnb ? 1 : 0),
    scanNative,
    scanTokens,
    checkedLogs,
    matchedDeposits,
    credited,
    duplicates,
    ...(pendingSeen ? { pendingSeen } : {}),
    ...(stoppedEarly ? { stoppedEarly, stopReason } : {}),
  };
}
