import "dotenv/config";
import { ethers } from "ethers";
import { getSql } from "../src/lib/db";
import { getBscProvider, getDepositAddressKey } from "../src/lib/blockchain/wallet";
import { getHotWalletAddress, getHotWalletKey } from "../src/lib/blockchain/hotWallet";
import { getTokenBalance, sendBnb, sendToken } from "../src/lib/blockchain/tokens";
import { upsertServiceHeartbeat } from "../src/lib/system/heartbeat";

// ── Well-known BEP-20 contracts to sweep (beyond what's in ex_asset) ─
const EXTRA_TOKENS: Record<string, string> = {
  // Mainnet
  WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  DAI:  "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
  ETH:  "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
  BTCB: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
  // Testnet extras can be added via env
};

type DepositRow = {
  address: string;
  derivation_index: number;
};

type SweepToken = {
  symbol: string;
  contract: string;
  decimals: number | null; // null = query on-chain
  minSweep: number;
};

const EXECUTE = process.env.SWEEP_EXECUTE === "true";
const MIN_BNB = process.env.SWEEP_MIN_BNB || "0.0001"; // ~$0.03 — sweep nearly everything
const DEFAULT_MIN_SWEEP = Number(process.env.SWEEP_MIN_TOKEN || "0.001"); // sweep tokens with >0.001 balance

const TOKEN_TRANSFER_GAS = 65000n; // safe upper bound for BEP-20 transfer
const NATIVE_TRANSFER_GAS = 21000n;
const GAS_MARGIN = 1.15; // 15% safety margin on gas top-ups

async function buildTokenList(sql: ReturnType<typeof getSql>): Promise<SweepToken[]> {
  // 1. Load from database (ex_asset with contract addresses)
  const dbAssets = await sql<{
    symbol: string;
    contract_address: string;
    decimals: number;
  }[]>`
    SELECT symbol, contract_address, decimals
    FROM ex_asset
    WHERE chain = 'bsc'
      AND is_enabled = true
      AND contract_address IS NOT NULL
  `;

  const seen = new Set<string>();
  const tokens: SweepToken[] = [];

  for (const a of dbAssets) {
    const key = a.contract_address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const envMin = process.env[`SWEEP_MIN_${a.symbol.toUpperCase()}`];
    tokens.push({
      symbol: a.symbol,
      contract: a.contract_address,
      decimals: a.decimals,
      minSweep: envMin ? Number(envMin) : DEFAULT_MIN_SWEEP,
    });
  }

  // 2. Add well-known extras not already in DB
  for (const [symbol, contract] of Object.entries(EXTRA_TOKENS)) {
    const key = contract.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const envMin = process.env[`SWEEP_MIN_${symbol.toUpperCase()}`];
    tokens.push({
      symbol,
      contract,
      decimals: null, // will be queried on-chain
      minSweep: envMin ? Number(envMin) : DEFAULT_MIN_SWEEP,
    });
  }

  return tokens;
}

async function main() {
  const sql = getSql();
  const provider = getBscProvider();
  const hotWallet = getHotWalletAddress();

  const beat = async (details?: Record<string, unknown>) => {
    try {
      await upsertServiceHeartbeat(sql, {
        service: "sweep-deposits:bsc",
        status: "ok",
        details: {
          execute: EXECUTE,
          min_bnb: MIN_BNB,
          min_token_default: DEFAULT_MIN_SWEEP,
          ...(details ?? {}),
        },
      });
    } catch {
      // ignore
    }
  };

  await beat({ event: "start" });

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");
  const tokenGasCost = gasPrice * TOKEN_TRANSFER_GAS;
  const nativeGasCost = gasPrice * NATIVE_TRANSFER_GAS;
  const minBnbWei = ethers.parseEther(MIN_BNB);

  const tokens = await buildTokenList(sql);

  console.log("--- DEPOSIT SWEEPER ---");
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "PLAN ONLY"}`);
  console.log(`Hot wallet: ${hotWallet}`);
  console.log(`Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`Token gas cost: ${ethers.formatEther(tokenGasCost)} BNB per token transfer`);
  console.log(`Native gas cost: ${ethers.formatEther(nativeGasCost)} BNB`);
  console.log(`Tokens tracked: ${tokens.map((t) => t.symbol).join(", ")} (${tokens.length} total)`);

  const deposits = await sql<DepositRow[]>`
    SELECT address, derivation_index
    FROM ex_deposit_address
    WHERE chain = 'bsc' OR chain = 'BSC'
    ORDER BY derivation_index ASC
  `;

  if (deposits.length === 0) {
    console.log("No deposit addresses found.");
    await beat({ event: "noop", deposits: 0 });
    return;
  }

  let totalSwept = 0;
  let totalGasTopups = 0;

  for (const dep of deposits) {
    const address = dep.address.toLowerCase();
    if (address === hotWallet.toLowerCase()) continue;

    let bnbBal = await provider.getBalance(address);
    const bnbFmt = ethers.formatEther(bnbBal);

    // Quick check: skip addresses with 0 BNB and scan tokens to see if any exist
    let hasAnyToken = false;

    const tokenResults: Array<{
      token: SweepToken;
      balance: string;
      decimals: number;
      balNum: number;
    }> = [];

    // Batch-check all tokens in parallel for this address
    const tokenChecks = await Promise.allSettled(
      tokens.map(async (t) => {
        const { balance, decimals } = await getTokenBalance(t.contract, address);
        return { token: t, balance, decimals, balNum: Number(balance) };
      })
    );
    for (const result of tokenChecks) {
      if (result.status === "fulfilled") {
        if (result.value.balNum > 0) hasAnyToken = true;
        tokenResults.push(result.value);
      }

      await beat({ event: "done", totalSwept, totalGasTopups, deposits: deposits.length });
    }

    // Skip entirely empty addresses
    if (bnbBal === 0n && !hasAnyToken) continue;

    console.log(`\nAddress ${address} (idx ${dep.derivation_index})`);
    console.log(`  BNB: ${bnbFmt}`);

    const privKey = await getDepositAddressKey(sql, address);
    if (!privKey) {
      console.log("  Skipping (no private key available)");
      continue;
    }

    // Count how many tokens need sweeping to calculate total gas needed
    const sweepableTokens = tokenResults.filter(
      (r) => !Number.isNaN(r.balNum) && r.balNum >= r.token.minSweep
    );

    for (const { token: t, balance, balNum } of tokenResults) {
      if (balNum > 0) console.log(`  ${t.symbol}: ${balance}`);
    }

    // Sweep tokens first (they need BNB for gas)
    if (sweepableTokens.length > 0) {
      // Calculate exact gas needed for all pending token sweeps
      const totalTokenGasNeeded = tokenGasCost * BigInt(sweepableTokens.length);
      const gasNeededWithMargin = (totalTokenGasNeeded * BigInt(Math.round(GAS_MARGIN * 100))) / 100n;

      // Top up gas only if needed, and only the exact amount required
      if (bnbBal < gasNeededWithMargin) {
        const deficit = gasNeededWithMargin - bnbBal;
        const topupAmount = ethers.formatEther(deficit);
        console.log(`  PLAN: top-up ${topupAmount} BNB for gas (${sweepableTokens.length} token transfers)`);
        if (EXECUTE) {
          try {
            const hotKey = getHotWalletKey();
            const tx = await sendBnb(hotKey, address, topupAmount);
            console.log(`  ✅ Gas top-up sent: ${tx.txHash}`);
            totalGasTopups++;
            await new Promise((r) => setTimeout(r, 3000));
            bnbBal = await provider.getBalance(address);
          } catch (e: any) {
            console.log(`  ❌ Gas top-up failed: ${e.message}`);
          }
        }
      }
    }

    // Sweep each token
    for (const { token: t, balance, decimals, balNum } of sweepableTokens) {
      if (bnbBal < tokenGasCost) {
        console.log(`  Skipping ${t.symbol} (insufficient gas: ${ethers.formatEther(bnbBal)} BNB)`);
        continue;
      }

      console.log(`  PLAN: sweep ${balance} ${t.symbol} -> ${hotWallet}`);
      if (EXECUTE) {
        try {
          const tx = await sendToken(t.contract, privKey, hotWallet, balance, decimals);
          console.log(`  ✅ ${t.symbol} swept: ${tx.txHash}`);
          totalSwept++;
          bnbBal = await provider.getBalance(address);
        } catch (e: any) {
          console.log(`  ❌ ${t.symbol} sweep failed: ${e.message}`);
        }
      }
    }

    // Sweep ALL remaining BNB last (send max minus exact gas cost)
    const remainingBnb = await provider.getBalance(address);
    if (remainingBnb > nativeGasCost) {
      const sweepable = remainingBnb - nativeGasCost;
      console.log(`  PLAN: sweep ${ethers.formatEther(sweepable)} BNB -> ${hotWallet}`);
      if (EXECUTE) {
        try {
          const wallet = new ethers.Wallet(privKey, provider);
          const tx = await wallet.sendTransaction({
            to: hotWallet,
            value: sweepable,
            gasLimit: NATIVE_TRANSFER_GAS,
            gasPrice,
          });
          console.log(`  ✅ BNB swept: ${tx.hash}`);
          totalSwept++;
        } catch (e: any) {
          console.log(`  ❌ BNB sweep failed: ${e.message}`);
        }
      }
    } else if (remainingBnb > 0n) {
      console.log(`  Dust: ${ethers.formatEther(remainingBnb)} BNB (< gas cost, leaving)`);
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(`Swept: ${totalSwept} transfers`);
  console.log(`Gas top-ups: ${totalGasTopups}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Sweeper failed:", err);
  process.exit(1);
});
