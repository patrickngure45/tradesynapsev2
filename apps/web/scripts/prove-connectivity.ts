// Script to prove data connectivity on local machine
import "dotenv/config";
import ccxt from "ccxt";

async function proveIt() {
  console.log("🕵️ TRUTH VERIFICATION PROTOCOL STARTING...\n");

  const exchanges = ['binance', 'bybit'];
  
  for (const exName of exchanges) {
    console.log(`📡 Connecting to ${exName.toUpperCase()} public API...`);
    try {
        const ex = new (ccxt as any)[exName]();
        ex.enableRateLimit = true;
        
        // 1. Check Ticker (Spot)
        console.log(`   stats: Fetching BTC/USDT spot price...`);
        const ticker = await ex.fetchTicker('BTC/USDT');
        console.log(`   ✅ PRICE: $${ticker.last}`);

        // 2. Check Funding (Perps)
        // Ensure we switch to 'swap' or 'future' context for funding
        const exSwap = new (ccxt as any)[exName]();
        exSwap.options = { defaultType: 'swap' }; 
        if (exName === 'bybit') {
           // Bybit sometimes needs 'linear' explicitly
           exSwap.options = { defaultType: 'swap', 'adjustForTimeDifference': true };
        }

        console.log(`   stats: Fetching BTC Funding Rate...`);
        // Use exact symbol format required for swap usually
        // Binance: BTC/USDT:USDT or BTC/USDT work if defaultType is swap
        const f = await exSwap.fetchFundingRate('BTC/USDT');
        const rate = f.fundingRate;
        const annualized = rate * 3 * 365 * 100;
        
        console.log(`   ✅ RATE: ${(rate * 100).toFixed(4)}% (Aprx ${annualized.toFixed(2)}% APY)`);
        
    } catch (e: any) {
        console.log(`   ❌ FAILED: ${e.message}`);
        if (e.message.includes("451") || e.message.includes("403")) {
            console.log("      (This is likely a Region Block on your local IP. It works on Railway/Server.)");
        }
    }
    console.log("\n");
  }

  process.exit(0);
}

proveIt();
