import "dotenv/config";

import { getSql } from "../src/lib/db";
import { sweepBscDeposits } from "../src/lib/blockchain/sweepDeposits";

async function main() {
  const sql = getSql();
  const result = await sweepBscDeposits(sql as any);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Sweeper failed:", err);
  process.exit(1);
});

