// HARD RESET SCRIPT
// WARNING: This deletes all trading history, orders, and balances.
// Use this to fix consistency errors in a new project.

import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();
  console.log("🚨 STARTING HARD RESET OF EXCHANGE DATA 🚨");
  console.log("This will wipe all orders, trades, and reset balances to zero.");

  try {
    await sql.begin(async (tx) => {
      // 1. Clear dependent tables first
      console.log("... Clearing executions");
      await tx`DELETE FROM ex_execution`;
      
      console.log("... Clearing Copy Trading");
      await tx`DELETE FROM copy_trading_subscription`;
      await tx`DELETE FROM copy_trading_leader`;

      console.log("... Clearing Orders");
      await tx`DELETE FROM ex_order`; // Orders must be deleted before holds if holds are referenced

      console.log("... Clearing withdrawals & holds");
      await tx`DELETE FROM ex_withdrawal_request`; 
      await tx`DELETE FROM ex_hold`; 
      
      console.log("... Clearing Journal (The Ledger)");
      await tx`DELETE FROM ex_journal_line`;
      await tx`DELETE FROM ex_journal_entry`;
      
      console.log("... Clearing P2P Trades");
      // P2P Dependent tables
      await tx`DELETE FROM onchain_tx`;
      await tx`DELETE FROM dispute_decision`;
      await tx`DELETE FROM dispute`;
      await tx`DELETE FROM evidence_object`;
      await tx`DELETE FROM risk_assessment`;
      await tx`DELETE FROM message`;
      await tx`DELETE FROM trade_state_transition`;
      await tx`DELETE FROM trade`;
      
      console.log("... Resetting Account Balances");
      // We don't delete accounts (users still need wallets), just zero them out
      await tx`UPDATE ex_ledger_account SET balance = 0, locked = 0`;

      console.log("... Clearing Arbitrage Data");
      await tx`DELETE FROM arb_price_snapshot`;
    });

    console.log("✅ HARD RESET COMPLETE. System is clean.");

  } catch (err) {
    console.error("❌ Reset Failed:", err);
  }
  process.exit(0);
}

main();
