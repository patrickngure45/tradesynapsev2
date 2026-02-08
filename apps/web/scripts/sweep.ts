import "dotenv/config";
import { ethers } from "ethers";
import { getSql } from "../src/lib/db";
import { getBscProvider, deriveWallet } from "../src/lib/blockchain/wallet";
import { getHotWalletAddress } from "../src/lib/blockchain/hotWallet";

const MIN_SWEEP = ethers.parseEther("0.005"); // Min balance to sweep (0.005 BNB)

async function main() {
  const sql = getSql();
  const provider = getBscProvider();
  
  let hotWallet: string;
  try {
      hotWallet = getHotWalletAddress();
  } catch (e) {
      console.error("❌ Failed to load Hot Wallet. Check DEPLOYER_PRIVATE_KEY.");
      process.exit(1);
  }
  
  console.log("--- 🧹 BNB Sweeper ---");
  console.log("Hot Wallet Destination:", hotWallet);

  const addrs = await sql<{ derivation_index: number; address: string }[]>`
    SELECT derivation_index, address FROM ex_deposit_address ORDER BY derivation_index ASC
  `;
  console.log(`Checking ${addrs.length} addresses...`);

  let sweptCount = 0;

  for (const r of addrs) {
    const bal = await provider.getBalance(r.address);
    if (bal > MIN_SWEEP) {
      console.log(`\nFound ${ethers.formatEther(bal)} BNB in ${r.address} (Idx ${r.derivation_index})`);
      
      try {
          const { privateKey } = deriveWallet(r.derivation_index);
          const wallet = new ethers.Wallet(privateKey, provider);
          
          const feeData = await provider.getFeeData();
          const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");
          const gasLimit = 21000n;
          const cost = gasPrice * gasLimit;
          const sendAmount = bal - cost;

          if (sendAmount <= 0n) {
              console.log("   (Skipping, insuffient for gas)");
              continue;
          }

          console.log(`   Sweeping ${ethers.formatEther(sendAmount)} BNB...`);
          const tx = await wallet.sendTransaction({
            to: hotWallet,
            value: sendAmount,
            gasLimit,
            gasPrice
          });
          console.log(`   ✅ Sent! Tx: ${tx.hash}`);
          sweptCount++;
      } catch (e: any) {
          console.error(`   ❌ Failed to sweep: ${e.message}`);
          if (e.message.includes("CITADEL_MASTER_SEED")) {
              console.error("      (Check env var CITADEL_MASTER_SEED)");
              process.exit(1);
          }
      }
    }
  }
  
  console.log(`\nDone. Swept ${sweptCount} addresses.`);
  process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
