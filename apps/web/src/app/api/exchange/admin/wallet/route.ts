import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getHotWalletAddress } from "@/lib/blockchain/hotWallet";
import { getAllBalances } from "@/lib/blockchain/tokens";
import { retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
const CAP_USER_ID = "00000000-0000-0000-0000-000000000002";
const BURN_USER_ID = "00000000-0000-0000-0000-000000000003";

export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  try {
    const address = getHotWalletAddress();

    // Fetch on-chain balances for the hot wallet
    const onChainBalances = await getAllBalances(address);

    // Fetch all enabled assets from the database
    const assets = await retryOnceOnTransientDbError(async () => {
      return await sql<
        { id: string; chain: string; symbol: string; name: string | null; decimals: number }[]
      >`
        SELECT id, chain, symbol, name, decimals
        FROM ex_asset
        WHERE is_enabled = true
        ORDER BY chain ASC, symbol ASC
      `;
    });

    // Aggregate ledger balances across NON-SYSTEM users per asset
    const ledgerSummary = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          asset_id: string;
          symbol: string;
          chain: string;
          total_posted: string;
          total_held: string;
          total_available: string;
          num_accounts: string;
        }[]
      >`
        WITH allowed_users AS (
          SELECT id
          FROM app_user
          WHERE status = 'active'
            AND id NOT IN (${SYSTEM_USER_ID}::uuid, ${CAP_USER_ID}::uuid, ${BURN_USER_ID}::uuid)
        ),
        account_posted AS (
          SELECT
            la.asset_id,
            la.id AS account_id,
            la.user_id,
            coalesce(sum(jl.amount), 0) AS posted
          FROM ex_ledger_account la
          LEFT JOIN ex_journal_line jl ON jl.account_id = la.id
          GROUP BY la.asset_id, la.id, la.user_id
        ),
        account_held AS (
          SELECT
            la.asset_id,
            la.id AS account_id,
            la.user_id,
            coalesce(sum(h.remaining_amount), 0) AS held
          FROM ex_ledger_account la
          LEFT JOIN ex_hold h ON h.account_id = la.id AND h.status = 'active'
          GROUP BY la.asset_id, la.id, la.user_id
        )
        SELECT
          a.id AS asset_id,
          a.symbol,
          a.chain,
          coalesce(sum(CASE WHEN ap.user_id IN (SELECT id FROM allowed_users) THEN ap.posted ELSE 0 END), 0)::text AS total_posted,
          coalesce(sum(CASE WHEN ah.user_id IN (SELECT id FROM allowed_users) THEN ah.held ELSE 0 END), 0)::text AS total_held,
          (
            coalesce(sum(CASE WHEN ap.user_id IN (SELECT id FROM allowed_users) THEN ap.posted ELSE 0 END), 0)
            -
            coalesce(sum(CASE WHEN ah.user_id IN (SELECT id FROM allowed_users) THEN ah.held ELSE 0 END), 0)
          )::text AS total_available,
          count(
            DISTINCT CASE
              WHEN ap.user_id IN (SELECT id FROM allowed_users)
               AND (ap.posted <> 0 OR ah.held <> 0)
              THEN ap.account_id
            END
          )::text AS num_accounts
        FROM ex_asset a
        LEFT JOIN account_posted ap ON ap.asset_id = a.id
        LEFT JOIN account_held ah ON ah.asset_id = a.id AND ah.account_id = ap.account_id
        WHERE a.is_enabled = true
        GROUP BY a.id, a.symbol, a.chain
        ORDER BY a.chain ASC, a.symbol ASC
      `;
    });

    // Fetch fee account totals (exchange-collected fees)
    const feeSummary = await retryOnceOnTransientDbError(async () => {
      return await sql<
        { symbol: string; chain: string; total_fees: string }[]
      >`
        SELECT
          a.symbol,
          a.chain,
          coalesce(sum(jl.amount), 0)::text AS total_fees
        FROM ex_journal_line jl
        JOIN ex_ledger_account la ON la.id = jl.account_id
        JOIN app_user u ON u.id = la.user_id
        JOIN ex_asset a ON a.id = la.asset_id
        JOIN ex_journal_entry je ON je.id = jl.entry_id
        WHERE je.type IN ('trade_fee', 'fee')
        GROUP BY a.symbol, a.chain
        ORDER BY a.chain ASC, a.symbol ASC
      `;
    });

    // Pending withdrawals summary
    const pendingWithdrawals = await retryOnceOnTransientDbError(async () => {
      return await sql<
        { symbol: string; chain: string; total_pending: string; count: string }[]
      >`
        SELECT
          a.symbol,
          a.chain,
          coalesce(sum(w.amount), 0)::text AS total_pending,
          count(*)::text AS count
        FROM ex_withdrawal_request w
        JOIN ex_asset a ON a.id = w.asset_id
        WHERE w.status IN ('requested', 'needs_review', 'approved')
        GROUP BY a.symbol, a.chain
        ORDER BY a.chain ASC, a.symbol ASC
      `;
    });

    // Fund wiring health snapshot
    const health = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<
        {
          pending_withdrawals: number;
          pending_withdrawal_amount: string;
          outbox_open: number;
          outbox_dead: number;
          outbox_with_errors: number;
          deposit_addresses: number;
          allowlist_approved: number;
        }[]
      >`
        WITH fund_topics AS (
          SELECT unnest(array[
            'ex.withdrawal.requested',
            'ex.withdrawal.approved',
            'ex.withdrawal.rejected',
            'ex.withdrawal.broadcasted',
            'ex.withdrawal.confirmed',
            'ex.withdrawal.failed',
            'ex.order.placed',
            'ex.order.canceled'
          ]) AS topic
        )
        SELECT
          (
            SELECT count(*)::int
            FROM ex_withdrawal_request
            WHERE status IN ('requested', 'needs_review', 'approved')
          ) AS pending_withdrawals,
          (
            SELECT coalesce(sum(amount), 0)::text
            FROM ex_withdrawal_request
            WHERE status IN ('requested', 'needs_review', 'approved')
          ) AS pending_withdrawal_amount,
          (
            SELECT count(*)::int
            FROM app_outbox_event e
            JOIN fund_topics t ON t.topic = e.topic
            WHERE e.processed_at IS NULL
              AND e.dead_lettered_at IS NULL
          ) AS outbox_open,
          (
            SELECT count(*)::int
            FROM app_outbox_event e
            JOIN fund_topics t ON t.topic = e.topic
            WHERE e.dead_lettered_at IS NOT NULL
          ) AS outbox_dead,
          (
            SELECT count(*)::int
            FROM app_outbox_event e
            JOIN fund_topics t ON t.topic = e.topic
            WHERE e.last_error IS NOT NULL
          ) AS outbox_with_errors,
          (
            SELECT count(*)::int
            FROM ex_deposit_address
            WHERE status IS NULL OR status = 'active'
          ) AS deposit_addresses,
          (
            SELECT count(*)::int
            FROM ex_withdrawal_allowlist
            WHERE status = 'approved'
          ) AS allowlist_approved
      `;

      const row = rows[0] ?? {
        pending_withdrawals: 0,
        pending_withdrawal_amount: "0",
        outbox_open: 0,
        outbox_dead: 0,
        outbox_with_errors: 0,
        deposit_addresses: 0,
        allowlist_approved: 0,
      };

      const hotWalletBnb = onChainBalances.find((b) => b.symbol.toUpperCase() === "BNB")?.balance ?? "0";
      const hotWalletHasGas = Number.parseFloat(hotWalletBnb) > 0.0001;

      return {
        pendingWithdrawals: row.pending_withdrawals,
        pendingWithdrawalAmount: row.pending_withdrawal_amount,
        outboxOpen: row.outbox_open,
        outboxDead: row.outbox_dead,
        outboxWithErrors: row.outbox_with_errors,
        depositAddresses: row.deposit_addresses,
        allowlistApproved: row.allowlist_approved,
        hotWalletBnb,
        hotWalletHasGas,
      };
    });

    // User counts breakdown
    const userCounts = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<{ total: string; admins: string; with_email: string; with_ledger: string }[]>`
        WITH real_users AS (
          SELECT id, role
          FROM app_user
          WHERE status = 'active'
            AND id <> '00000000-0000-0000-0000-000000000001'::uuid
            AND email IS NOT NULL
            AND password_hash IS NOT NULL
            AND lower(email) NOT LIKE '%@test.local'
            AND lower(email) NOT LIKE '%@demo.com'
            AND lower(email) NOT LIKE 'smoke-%'
            AND lower(email) NOT IN (
              'trial@gmail.com',
              'test-debug@test.local',
              'taker@demo.com',
              'marketmaker@system.local',
              'mm@tradesynapse.com',
              'mint@system.local'
            )
        )
        SELECT
          (SELECT count(*) FROM real_users)::text AS total,
          (SELECT count(*) FROM real_users WHERE role = 'admin')::text AS admins,
          (SELECT count(*) FROM real_users)::text AS with_email,
          (
            SELECT count(DISTINCT la.user_id)
            FROM ex_ledger_account la
            JOIN real_users ru ON ru.id = la.user_id
          )::text AS with_ledger
      `;
      return rows[0] ?? { total: "0", admins: "0", with_email: "0", with_ledger: "0" };
    });

    return NextResponse.json({
      address,
      onChain: onChainBalances,
      assets,
      ledger: ledgerSummary,
      fees: feeSummary,
      pendingWithdrawals,
      health,
      userCounts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
