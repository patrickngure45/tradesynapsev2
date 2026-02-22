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
        console.error(
          "[deposit-scan] token_symbols_required: set DEPOSIT_SCAN_SYMBOLS=USDT,USDC (or set ALLOW_TOKEN_SCAN_ALL=1)",
        );
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
