/**
 * BSC HD Wallet Derivation for TradeSynapse
 *
 * Derives per-user deposit addresses from CITADEL_MASTER_SEED using
 * BIP-44 path: m/44'/60'/0'/0/{index}
 *
 * Each user gets a unique index stored in ex_deposit_address.
 * The master seed NEVER leaves the server.
 */
import { ethers } from "ethers";
import type { Sql } from "postgres";

// ── BSC RPC Provider ─────────────────────────────────────────────────
let _provider: ethers.JsonRpcProvider | null = null;
let _readProvider: ethers.AbstractProvider | null = null;
let _ethProvider: ethers.JsonRpcProvider | null = null;

function parseRpcUrls(raw: string): string[] {
  return raw
    .split(/[\s,\n]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((u) => u.startsWith("http://") || u.startsWith("https://"));
}

function getBscRpcUrls(): string[] {
  const primary = (process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org").trim();
  const extraRaw = (process.env.BSC_RPC_URLS ?? process.env.BSC_RPC_FALLBACK_URLS ?? "").trim();
  const extras = extraRaw ? parseRpcUrls(extraRaw) : [];
  const out = [primary, ...extras].map((s) => s.trim()).filter(Boolean);
  // de-dupe
  const seen = new Set<string>();
  return out.filter((u) => {
    const key = u.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getBscProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    const rpcUrl = (process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org").trim();
    const chainId = Number(process.env.NEXT_PUBLIC_USE_MAINNET) === 0 ? 97 : 56;
    const network = ethers.Network.from({ name: "bnb", chainId });
    _provider = new ethers.JsonRpcProvider(rpcUrl, network, { staticNetwork: network });
  }
  return _provider;
}

/**
 * Read-only provider with multi-RPC fallback.
 *
 * Uses BSC_RPC_URL as primary and BSC_RPC_URLS as comma/newline/space-separated fallbacks.
 * Quorum is set to 1, so this behaves like a fast failover (not consensus).
 */
export function getBscReadProvider(): ethers.AbstractProvider {
  if (_readProvider) return _readProvider;

  const urls = getBscRpcUrls();
  const chainId = Number(process.env.NEXT_PUBLIC_USE_MAINNET) === 0 ? 97 : 56;
  const network = ethers.Network.from({ name: "bnb", chainId });

  if (urls.length <= 1) {
    _readProvider = getBscProvider();
    return _readProvider;
  }

  const stallTimeout = (() => {
    const raw = String(process.env.BSC_RPC_STALL_TIMEOUT_MS ?? process.env.RPC_STALL_TIMEOUT_MS ?? "2000").trim();
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(200, Math.min(15_000, Math.trunc(n))) : 2000;
  })();

  const configs = urls.map((url, idx) => {
    const provider = new ethers.JsonRpcProvider(url, network, { staticNetwork: network });
    return { provider, priority: idx + 1, weight: 1, stallTimeout };
  });

  _readProvider = new ethers.FallbackProvider(configs, network, { quorum: 1 });
  return _readProvider;
}

export function getEthProvider(): ethers.JsonRpcProvider {
  if (!_ethProvider) {
    const rpcUrl = process.env.ETH_RPC_URL || process.env.ETHEREUM_RPC_URL || "https://cloudflare-eth.com";
    const chainId = Number(process.env.NEXT_PUBLIC_USE_MAINNET) === 0 ? 11155111 : 1;
    const network = ethers.Network.from({ name: "ethereum", chainId });
    _ethProvider = new ethers.JsonRpcProvider(rpcUrl, network, { staticNetwork: network });
  }
  return _ethProvider;
}

// ── HD Wallet ────────────────────────────────────────────────────────
function getMasterSeed(): string {
  const seed = process.env.CITADEL_MASTER_SEED;
  if (!seed) throw new Error("CITADEL_MASTER_SEED is not set");
  return seed.replace(/"/g, "").trim();
}

/**
 * Derive a wallet at BIP-44 index.
 * m/44'/60'/0'/0/{index}
 */
export function deriveWallet(index: number): { address: string; privateKey: string } {
  const mnemonic = getMasterSeed();
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
  return {
    address: hdNode.address.toLowerCase(),
    privateKey: hdNode.privateKey,
  };
}

/**
 * Get or create a deposit address for a user + chain combination.
 * Uses advisory lock to prevent race conditions on index allocation.
 */
export async function getOrCreateDepositAddress(
  sql: Sql,
  userId: string,
  chain: string = "bsc",
): Promise<{ address: string; isNew: boolean }> {
  // Check existing first
  const existing = await sql<{ address: string }[]>`
    SELECT address FROM ex_deposit_address
    WHERE user_id = ${userId} AND chain = ${chain}
    LIMIT 1
  `;

  if (existing.length > 0) {
    return { address: existing[0]!.address, isNew: false };
  }

  // Allocate next index under advisory lock
  const result = await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    // Lock to serialize index allocation
    const lockKey = `deposit_address_alloc:${chain}`;
    await txSql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    // Double-check after lock
    const check = await txSql<{ address: string }[]>`
      SELECT address FROM ex_deposit_address
      WHERE user_id = ${userId} AND chain = ${chain}
      LIMIT 1
    `;
    if (check.length > 0) {
      return { address: check[0]!.address, isNew: false };
    }

    // Get next index
    const maxRows = await txSql<{ max_idx: number | null }[]>`
      SELECT max(derivation_index) AS max_idx FROM ex_deposit_address WHERE chain = ${chain}
    `;
    const nextIndex = (maxRows[0]?.max_idx ?? -1) + 1;

    // Derive the address
    const wallet = deriveWallet(nextIndex);

    // Best-effort: record the current chain tip at assignment time.
    // This helps deposit scanners avoid scanning ancient history.
    let assignedBlock: number | null = null;
    try {
      if (chain === "bsc") {
        const provider = getBscProvider();
        assignedBlock = await provider.getBlockNumber();
      }
    } catch {
      assignedBlock = null;
    }

    // Insert
    await txSql`
      INSERT INTO ex_deposit_address (user_id, chain, address, derivation_index)
      VALUES (${userId}, ${chain}, ${wallet.address}, ${nextIndex})
    `;

    if (assignedBlock != null && Number.isFinite(assignedBlock) && assignedBlock > 0) {
      try {
        await txSql`
          UPDATE ex_deposit_address
          SET assigned_block = ${assignedBlock}
          WHERE user_id = ${userId} AND chain = ${chain}
        `;
      } catch {
        // ignore
      }
    }

    return { address: wallet.address, isNew: true };
  });

  return result;
}

/**
 * Get the private key for a deposit address (for sweeping/signing).
 * Only used server-side for withdrawal broadcasting.
 */
export async function getDepositAddressKey(
  sql: Sql,
  address: string,
): Promise<string | null> {
  const rows = await sql<{ derivation_index: number }[]>`
    SELECT derivation_index FROM ex_deposit_address
    WHERE address = ${address.toLowerCase()}
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const wallet = deriveWallet(rows[0]!.derivation_index);
  return wallet.privateKey;
}
