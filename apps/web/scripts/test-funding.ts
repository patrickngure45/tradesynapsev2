import "dotenv/config";
import { getSql } from "../src/lib/db";
import { captureFundingSignals, getLatestFundingSignals } from "../src/lib/exchange/funding";


async function main() {
  const sql = getSql();
  console.log("🔍 Scanning Funding Rates...");
  
  const result = await captureFundingSignals(sql);
  console.log("Scan Result:", result);

  const best = await getLatestFundingSignals(sql);
  console.log("\n🏆 Top Opportunities:");
  best.forEach(s => {
      console.log(`[${s.subject_id}] APR: ${s.score}% (Rate: ${s.payload_json.fundingRate})`);
  });

  process.exit(0);
}

main();
