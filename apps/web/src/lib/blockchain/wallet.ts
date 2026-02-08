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

export function getBscProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    const rpcUrl = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
    _provider = new ethers.JsonRpcProvider(rpcUrl, {
      name: "bnb",
      chainId: Number(process.env.NEXT_PUBLIC_USE_MAINNET) === 0 ? 97 : 56,
    });
  }
  return _provider;
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
    await txSql`SELECT pg_advisory_xact_lock(hashtext('deposit_address_alloc'))`;

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

    // Insert
    await txSql`
      INSERT INTO ex_deposit_address (user_id, chain, address, derivation_index)
      VALUES (${userId}, ${chain}, ${wallet.address}, ${nextIndex})
    `;

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
