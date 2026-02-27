import "dotenv/config";
import { ethers } from "ethers";
import { getSql } from "../src/lib/db";
import { getBscProvider, deriveWallet } from "../src/lib/blockchain/wallet";
import { getHotWalletAddress } from "../src/lib/blockchain/hotWallet";

async function main() {
  console.log("--- 🕵️ Citadel Security & Configuration Diagnostic ---");
  const issues: string[] = [];
  const warnings: string[] = [];

  // 1. Check Environment Variables
  const seed = process.env.CITADEL_MASTER_SEED;
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const rpcUrl = process.env.BSC_RPC_URL || "https://binance.llamarpc.com"; // Default fallback

  if (!seed) {
    issues.push("❌ Missing Env Var: CITADEL_MASTER_SEED (Required for generating user deposit addresses)");
  } else {
    // Basic validation of seed phrase
    const words = seed.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      warnings.push("⚠️ CITADEL_MASTER_SEED does not look like a standard 12/24 word mnemonic (word count: " + words.length + ").");
    } else {
      console.log("✅ Deposit Wallet Seed configured.");
    }
  }

  if (!deployerKey) {
    issues.push("❌ Missing Env Var: DEPLOYER_PRIVATE_KEY (Required for Hot Wallet withdrawals)");
  } else {
    try {
      const addr = getHotWalletAddress();
      const bal = await (getBscProvider().getBalance(addr));
      const balFmt = ethers.formatEther(bal);
      console.log(`✅ Hot Wallet configured: ${addr} (Balance: ${balFmt} BNB)`);
    } catch (e) {
      issues.push("❌ DEPLOYER_PRIVATE_KEY is invalid (cannot derive address).");
    }
  }

  // 2. Check Database Connection
  const sql = getSql();
  try {
    const [{ count }] = await sql`SELECT count(*) FROM ex_deposit_address`;
    console.log("✅ Database connection successful.");
  } catch (e: any) {
    issues.push(`❌ Database connection failed: ${e.message}`);
  }

  // 3. Check Blockchain Connection
  const provider = getBscProvider();
  try {
    const block = await provider.getBlock("latest");
    console.log(`✅ Blockchain Connected via ${rpcUrl} (Block: ${block?.number})`);
  } catch (e: any) {
    issues.push(`❌ Blockchain connection failed: ${e.message}`);
  }

  // Report
  console.log("\n--- Diagnostic Report ---");
  if (issues.length === 0) {
    console.log("✅✅✅ SYSTEM READY FOR REAL FUNDS ✅✅✅");
    console.log("Configuration looks correct. You can now run the operational scripts.");
  } else {
    console.log("🛑 Configuration Issues Found:");
    issues.forEach(i => console.log(i));
    
    if (process.argv.includes("--ignore-errors")) {
        console.log("\n(Continuing despite errors due to --ignore-errors...)");
    } else {
        console.log("\nPlease fix these issues in your .env file and try again.");
        process.exit(1);
    }
  }

  if (warnings.length > 0) {
      console.log("\n⚠️ Warnings:");
      warnings.forEach(w => console.log(w));
  }
}

main().catch(err => {
    console.error("Diagnostic crashed:", err);
    process.exit(1);
});
