/**
 * Ledger reconciliation checks.
 *
 * These are pure SQL queries that verify the internal consistency of
 * the double-entry ledger, holds, and order lifecycle.  They are
 * designed to run periodically (cron / outbox worker) or on-demand
 * via an admin API endpoint.
 *
 * Every check returns a list of violations.  An empty array = healthy.
 */

import type postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

// ── Check result types ────────────────────────────────────────────────

export type ReconciliationResult = {
  check: string;
  ok: boolean;
  violations: unknown[];
  durationMs: number;
};

export type FullReconciliationReport = {
  ts: string;
  ok: boolean;
  checks: ReconciliationResult[];
  durationMs: number;
};

// ── Individual checks ─────────────────────────────────────────────────

/**
 * 1. Global zero-sum: across ALL accounts, for each asset,
 *    the sum of all journal lines must equal zero.
 *    (Every debit has a matching credit.)
 */
async function checkGlobalZeroSum(sql: Sql): Promise<ReconciliationResult> {
  const start = Date.now();
  const rows = await sql<{ asset_id: string; symbol: string; total: string }[]>`
    SELECT jl.asset_id, a.symbol, sum(jl.amount)::text AS total
    FROM ex_journal_line jl
    JOIN ex_asset a ON a.id = jl.asset_id
    GROUP BY jl.asset_id, a.symbol
    HAVING sum(jl.amount) <> 0
  `;
  return {
    check: "global_zero_sum",
    ok: rows.length === 0,
    violations: rows,
    durationMs: Date.now() - start,
  };
}

/**
 * 2. Per-account non-negative posted balance:
 *    No account should have a negative posted balance
 *    (sum of journal lines < 0).
 */
async function checkNoNegativePosted(sql: Sql): Promise<ReconciliationResult> {
  const start = Date.now();
  const rows = await sql<{ account_id: string; user_id: string; symbol: string; posted: string }[]>`
    SELECT acct.id AS account_id, acct.user_id::text, a.symbol,
           sum(jl.amount)::text AS posted
    FROM ex_ledger_account acct
    JOIN ex_journal_line jl ON jl.account_id = acct.id
    JOIN ex_asset a ON a.id = acct.asset_id
    GROUP BY acct.id, acct.user_id, a.symbol
    HAVING sum(jl.amount) < 0
  `;
  return {
    check: "no_negative_posted",
    ok: rows.length === 0,
    violations: rows,
    durationMs: Date.now() - start,
  };
}

/**
 * 3. Held ≤ Posted: for every account with active holds,
 *    the total held amount must not exceed the posted balance.
 */
async function checkHeldLtePosted(sql: Sql): Promise<ReconciliationResult> {
  const start = Date.now();
  const rows = await sql<{ account_id: string; user_id: string; symbol: string; posted: string; held: string }[]>`
    WITH posted AS (
      SELECT acct.id AS account_id, acct.user_id, acct.asset_id,
             coalesce(sum(jl.amount), 0) AS posted
      FROM ex_ledger_account acct
      LEFT JOIN ex_journal_line jl ON jl.account_id = acct.id
      GROUP BY acct.id
    ),
    held AS (
      SELECT account_id, coalesce(sum(remaining_amount), 0) AS held
      FROM ex_hold
      WHERE status = 'active'
      GROUP BY account_id
    )
    SELECT p.account_id::text, p.user_id::text, a.symbol,
           p.posted::text, h.held::text
    FROM posted p
    JOIN held h ON h.account_id = p.account_id
    JOIN ex_asset a ON a.id = p.asset_id
    WHERE h.held > p.posted
  `;
  return {
    check: "held_lte_posted",
    ok: rows.length === 0,
    violations: rows,
    durationMs: Date.now() - start,
  };
}

/**
 * 4. Terminal orders have no active holds:
 *    Orders in 'filled' or 'canceled' status must NOT have an
 *    associated hold that is still 'active'.
 */
async function checkTerminalOrdersNoActiveHolds(sql: Sql): Promise<ReconciliationResult> {
  const start = Date.now();
  const rows = await sql<{ order_id: string; order_status: string; hold_id: string; hold_status: string }[]>`
    SELECT o.id::text AS order_id, o.status AS order_status,
           h.id::text AS hold_id, h.status AS hold_status
    FROM ex_order o
    JOIN ex_hold h ON h.id = o.hold_id
    WHERE o.status IN ('filled', 'canceled')
      AND h.status = 'active'
  `;
  return {
    check: "terminal_orders_no_active_holds",
    ok: rows.length === 0,
    violations: rows,
    durationMs: Date.now() - start,
  };
}

/**
 * 5. Execution quantity consistency:
 *    For each order, the sum of execution quantities should equal
 *    (original quantity - remaining quantity).
 */
async function checkExecutionQuantityConsistency(sql: Sql): Promise<ReconciliationResult> {
  const start = Date.now();
  const rows = await sql<{
    order_id: string; side: string; original_qty: string;
    remaining_qty: string; expected_filled: string; actual_filled: string;
  }[]>`
    WITH exec_sums AS (
      SELECT order_id, sum(quantity) AS filled
      FROM (
        SELECT maker_order_id AS order_id, quantity FROM ex_execution
        UNION ALL
        SELECT taker_order_id AS order_id, quantity FROM ex_execution
      ) t
      GROUP BY order_id
    )
    SELECT o.id::text AS order_id, o.side,
           o.quantity::text AS original_qty,
           o.remaining_quantity::text AS remaining_qty,
           (o.quantity - o.remaining_quantity)::text AS expected_filled,
           coalesce(es.filled, 0)::text AS actual_filled
    FROM ex_order o
    LEFT JOIN exec_sums es ON es.order_id = o.id
    WHERE (o.quantity - o.remaining_quantity) <> coalesce(es.filled, 0)
    LIMIT 50
  `;
  return {
    check: "execution_quantity_consistency",
    ok: rows.length === 0,
    violations: rows,
    durationMs: Date.now() - start,
  };
}

/**
 * 6. Journal entry balance (re-verification):
 *    Every individual journal entry should be balanced per asset.
 *    (The trigger enforces this at write time, but this re-checks
 *     for corruption or manual DB edits.)
 */
async function checkJournalEntryBalance(sql: Sql): Promise<ReconciliationResult> {
  const start = Date.now();
  const rows = await sql<{ entry_id: string; asset_id: string; imbalance: string }[]>`
    SELECT entry_id::text, asset_id::text, sum(amount)::text AS imbalance
    FROM ex_journal_line
    GROUP BY entry_id, asset_id
    HAVING sum(amount) <> 0
    LIMIT 50
  `;
  return {
    check: "journal_entry_balance",
    ok: rows.length === 0,
    violations: rows,
    durationMs: Date.now() - start,
  };
}

/**
 * 7. Fee collector consistency:
 *    Total fees recorded on executions should equal the fee collector's
 *    posted balance (for each market's quote asset).
 */
async function checkFeeCollectorConsistency(sql: Sql): Promise<ReconciliationResult> {
  const start = Date.now();
  const FEE_USER_ID = "00000000-0000-0000-0000-000000000001";

  const rows = await sql<{
    quote_asset_id: string; symbol: string;
    exec_fees_total: string; collector_posted: string;
  }[]>`
    WITH exec_fees AS (
      SELECT m.quote_asset_id, sum(e.maker_fee_quote + e.taker_fee_quote) AS total_fees
      FROM ex_execution e
      JOIN ex_market m ON m.id = e.market_id
      GROUP BY m.quote_asset_id
    ),
    collector AS (
      SELECT acct.asset_id, coalesce(sum(jl.amount), 0) AS posted
      FROM ex_ledger_account acct
      JOIN ex_journal_line jl ON jl.account_id = acct.id
      WHERE acct.user_id = ${FEE_USER_ID}::uuid
      GROUP BY acct.asset_id
    )
    SELECT ef.quote_asset_id::text, a.symbol,
           ef.total_fees::text AS exec_fees_total,
           coalesce(c.posted, 0)::text AS collector_posted
    FROM exec_fees ef
    LEFT JOIN collector c ON c.asset_id = ef.quote_asset_id
    JOIN ex_asset a ON a.id = ef.quote_asset_id
    WHERE ef.total_fees <> coalesce(c.posted, 0)
  `;
  return {
    check: "fee_collector_consistency",
    ok: rows.length === 0,
    violations: rows,
    durationMs: Date.now() - start,
  };
}

// ── Full reconciliation run ───────────────────────────────────────────

const ALL_CHECKS = [
  checkGlobalZeroSum,
  checkNoNegativePosted,
  checkHeldLtePosted,
  checkTerminalOrdersNoActiveHolds,
  checkExecutionQuantityConsistency,
  checkJournalEntryBalance,
  checkFeeCollectorConsistency,
];

export async function runFullReconciliation(sql: Sql): Promise<FullReconciliationReport> {
  const start = Date.now();
  const checks: ReconciliationResult[] = [];

  for (const check of ALL_CHECKS) {
    checks.push(await check(sql));
  }

  const ok = checks.every((c) => c.ok);

  return {
    ts: new Date().toISOString(),
    ok,
    checks,
    durationMs: Date.now() - start,
  };
}
