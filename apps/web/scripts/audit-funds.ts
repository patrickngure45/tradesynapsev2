
import "dotenv/config";
import { ethers } from "ethers";
import { getSql } from "../src/lib/db";
import { deriveWallet, getBscProvider } from "../src/lib/blockchain/wallet";
import { getHotWalletAddress } from "../src/lib/blockchain/hotWallet";
import { getTokenAddress, getTokenBalance } from "../src/lib/blockchain/tokens";

async function main() {
  console.log("--- 🕵️ Citadel Fund Auditor ---");

  const sql = getSql();
  const provider = getBscProvider();
  
  // 1. Check Hot Wallet
  const hotAddr = getHotWalletAddress();
  const usdtAddr = getTokenAddress("USDT");
  
  console.log(`\n🔥 HOT WALLET: ${hotAddr}`);

  // Check BSC (Primary)
  const bnb = await provider.getBalance(hotAddr);
  console.log(`   - BSC (BNB): ${ethers.formatEther(bnb)}`);
  
  if (usdtAddr) {
    try {
      const hotUsdt = await getTokenBalance(usdtAddr, hotAddr);
      console.log(`   - BSC (USDT): ${hotUsdt.balance}`);
    } catch (e) { console.log("   - BSC (USDT): Error/0"); }
  }

  // Check ETH
  try {
    const ethRpc = process.env.ETHEREUM_RPC_URL;
    if (ethRpc) {
       const ethProvider = new ethers.JsonRpcProvider(ethRpc);
       const ethBal = await ethProvider.getBalance(hotAddr);
       console.log(`   - ETH (ETH): ${ethers.formatEther(ethBal)}`);
    }
  } catch (e) { console.log("   - ETH: Unreachable"); }

  // Check Polygon
  try {
    const polyRpc = process.env.POLYGON_RPC_URL;
    if (polyRpc) {
       const polyProvider = new ethers.JsonRpcProvider(polyRpc);
       const maticBal = await polyProvider.getBalance(hotAddr);
       console.log(`   - Polygon (MATIC): ${ethers.formatEther(maticBal)}`);
    }
  } catch (e) { console.log("   - Polygon: Unreachable"); }


  // 2. Check Deposit Addresses
  console.log("\n📥 CHECKING DEPOSIT ADDRESSES...");
  
  const deposits = await sql`
    SELECT id, user_id, chain, derivation_index, address 
    FROM ex_deposit_address 
    WHERE chain = 'bsc' or chain = 'BSC'
    ORDER BY derivation_index ASC
  `;

  console.log(`Found ${deposits.length} deposit addresses in DB.`);

  let totalBnb = BigInt(0);
  let totalUsdt = 0;

  for (const dep of deposits) {
    // Verify derivation
    const derived = deriveWallet(dep.derivation_index);
    if (derived.address.toLowerCase() !== dep.address.toLowerCase()) {
      console.error(`⚠️ MISMATCH for index ${dep.derivation_index}: DB=${dep.address}, Derived=${derived.address}`);
    }

    const bnb = await provider.getBalance(dep.address);
    totalBnb += bnb;
    
    let usdt = "0.0";
    if (usdtAddr) {
      const b = await getTokenBalance(usdtAddr, dep.address);
      usdt = b.balance;
      totalUsdt += parseFloat(usdt);
    }
    
    if (bnb > 0 || parseFloat(usdt) > 0) {
       console.log(`   [Index ${dep.derivation_index}] ${dep.address}: ${ethers.formatEther(bnb)} BNB, ${usdt} USDT`);
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(`Total User Holdings (Deposit Addrs): ${ethers.formatEther(totalBnb)} BNB, ${totalUsdt} USDT`);
}

main().catch(console.error).finally(() => process.exit());
