// Run Reconciliation Checks
import { getSql } from "../src/lib/db";
import { runFullReconciliation } from "../src/lib/exchange/reconciliation";

async function main() {
  const sql = getSql();
  console.log("🔍 Running Ledger Reconciliation...");

  try {
    const report = await runFullReconciliation(sql);

    console.log(`\nReconciliation Status: ${report.ok ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Duration: ${report.durationMs}ms\n`);

    for (const check of report.checks) {
      const icon = check.ok ? "✅" : "❌";
      console.log(`${icon} ${check.check.padEnd(35)} ${check.durationMs}ms`);
      
      if (!check.ok) {
        console.error("   Violations found:", check.violations);
      }
    }
    
    if (report.ok) {
       console.log("\nSuccess: The internal ledger is mathematically consistent.");
    } else {
       console.log("\nFailure: Inconsistencies detected. Review violations above.");
    }

  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

main();
