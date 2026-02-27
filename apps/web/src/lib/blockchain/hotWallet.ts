/**
 * Hot Wallet accessor for withdrawal broadcasting.
 *
 * The hot wallet is defined by DEPLOYER_PRIVATE_KEY in .env.
 * It holds a minimized float and is only accessed server-side.
 *
 * AI never signs transactions.  AI never directly moves money.
 * Only this module and the broadcast handler touch the private key.
 */
import { ethers } from "ethers";

let _cachedAddress: string | null = null;
let _cachedKey: string | null = null;

function getEnvKey(): string {
  const k = process.env.DEPLOYER_PRIVATE_KEY;
  if (!k) throw new Error("DEPLOYER_PRIVATE_KEY is not set");
  return k.startsWith("0x") ? k : `0x${k}`;
}

/** Get the hot wallet address (public, safe to log). */
export function getHotWalletAddress(): string {
  if (!_cachedAddress) {
    const wallet = new ethers.Wallet(getEnvKey());
    _cachedAddress = wallet.address.toLowerCase();
  }
  return _cachedAddress;
}

/**
 * Get the hot wallet private key.
 * NEVER log this value. Callers must use it only inside sendToken / sendBnb.
 */
export function getHotWalletKey(): string {
  if (!_cachedKey) {
    _cachedKey = getEnvKey();
  }
  return _cachedKey;
}
