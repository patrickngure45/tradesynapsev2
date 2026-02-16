import "dotenv/config";
import { ethers } from "ethers";
import { getSql } from "../src/lib/db";
import { getBscProvider, deriveWallet } from "../src/lib/blockchain/wallet";
import { getHotWalletAddress } from "../src/lib/blockchain/hotWallet";

// Sweep any address that has more BNB than the cost of a transfer.
// No arbitrary minimum — if it's profitable to sweep (balance > gas), sweep it.

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

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");
  const gasLimit = 21000n;
  const gasCost = gasPrice * gasLimit;
  
  console.log("--- 🧹 BNB Sweeper ---");
  console.log("Hot Wallet Destination:", hotWallet);
  console.log(`Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`Gas cost per sweep: ${ethers.formatEther(gasCost)} BNB`);

  const addrs = await sql<{ derivation_index: number; address: string }[]>`
    SELECT derivation_index, address FROM ex_deposit_address ORDER BY derivation_index ASC
  `;
  console.log(`Checking ${addrs.length} addresses...`);

  let sweptCount = 0;
  let totalSweptWei = 0n;

  for (const r of addrs) {
    const bal = await provider.getBalance(r.address);
    // Only sweep if balance exceeds exact gas cost (no arbitrary minimum)
    if (bal > gasCost) {
      const sendAmount = bal - gasCost;
      console.log(`\n${r.address} (idx ${r.derivation_index}): ${ethers.formatEther(bal)} BNB → sweep ${ethers.formatEther(sendAmount)}`);
      
      try {
          const { privateKey } = deriveWallet(r.derivation_index);
          const wallet = new ethers.Wallet(privateKey, provider);
          
          const tx = await wallet.sendTransaction({
            to: hotWallet,
            value: sendAmount,
            gasLimit,
            gasPrice
          });
          console.log(`   ✅ Tx: ${tx.hash}`);
          sweptCount++;
          totalSweptWei += sendAmount;
      } catch (e: any) {
          console.error(`   ❌ Failed: ${e.message}`);
          if (e.message.includes("CITADEL_MASTER_SEED")) {
              console.error("      (Check env var CITADEL_MASTER_SEED)");
              process.exit(1);
          }
      }
    }
  }
  
  console.log(`\nDone. Swept ${sweptCount} addresses, total ${ethers.formatEther(totalSweptWei)} BNB.`);
  process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
