/**
 * BEP-20 Token interactions on BSC
 *
 * Provides balance checks, transfer functions, and deposit detection
 * for USDT and native BNB.
 */
import { ethers } from "ethers";
import { getBscProvider, getBscReadProvider } from "./wallet";

// ── Standard BEP-20 ABI (minimal) ───────────────────────────────────
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
] as const;

// ── Known contract addresses ─────────────────────────────────────────
export type KnownToken = "USDT" | "BNB";

const MAINNET_TOKENS: Record<string, string> = {
  USDT: "0x55d398326f99059fF775485246999027B3197955", // BSC-USD (Binance-Peg)
};

const TESTNET_TOKENS: Record<string, string> = {
  USDT: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", // Testnet USDT mock
};

export function getTokenAddress(symbol: string): string | null {
  const isMainnet = process.env.NEXT_PUBLIC_USE_MAINNET !== "false";
  const tokens = isMainnet ? MAINNET_TOKENS : TESTNET_TOKENS;
  return tokens[symbol.toUpperCase()] ?? null;
}

// ── Balance queries ──────────────────────────────────────────────────

/** Get native BNB balance */
export async function getBnbBalance(address: string): Promise<string> {
  const provider = getBscReadProvider();
  const bal = await provider.getBalance(address);
  return ethers.formatEther(bal);
}

/** Get BEP-20 token balance */
export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string,
): Promise<{ balance: string; decimals: number }> {
  const provider = getBscReadProvider();
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [bal, decimals] = await Promise.all([
    contract.balanceOf(walletAddress) as Promise<bigint>,
    contract.decimals() as Promise<number>,
  ]);
  return {
    balance: ethers.formatUnits(bal, decimals),
    decimals,
  };
}

/** Get all known token balances for a wallet */
export async function getAllBalances(walletAddress: string): Promise<
  { symbol: string; balance: string; contractAddress: string | null }[]
> {
  const results: { symbol: string; balance: string; contractAddress: string | null }[] = [];

  // BNB (native)
  try {
    const bnb = await getBnbBalance(walletAddress);
    results.push({ symbol: "BNB", balance: bnb, contractAddress: null });
  } catch {
    results.push({ symbol: "BNB", balance: "0", contractAddress: null });
  }

  // BEP-20 tokens
  for (const symbol of ["USDT"] as const) {
    const addr = getTokenAddress(symbol);
    if (!addr) continue;
    try {
      const { balance } = await getTokenBalance(addr, walletAddress);
      results.push({ symbol, balance, contractAddress: addr });
    } catch {
      results.push({ symbol, balance: "0", contractAddress: addr });
    }
  }

  return results;
}

// ── Transfer functions ───────────────────────────────────────────────

/** Send BEP-20 tokens from a wallet (requires private key) */
export async function sendToken(
  tokenAddress: string,
  privateKey: string,
  to: string,
  amount: string,
  decimals: number = 18,
): Promise<{ txHash: string }> {
  const provider = getBscProvider();
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

  const amountWei = ethers.parseUnits(amount, decimals);
  const tx = await contract.transfer(to, amountWei) as ethers.TransactionResponse;
  await tx.wait(1);

  return { txHash: tx.hash };
}

/** Send native BNB */
export async function sendBnb(
  privateKey: string,
  to: string,
  amount: string,
): Promise<{ txHash: string }> {
  const provider = getBscProvider();
  const signer = new ethers.Wallet(privateKey, provider);

  const tx = await signer.sendTransaction({
    to,
    value: ethers.parseEther(amount),
  });
  await tx.wait(1);

  return { txHash: tx.hash };
}
