/**
 * Outbox handler: broadcast an approved withdrawal on-chain.
 *
 * Flow:
 *   1. Lock the row by setting status = 'broadcasted' (prevents double-send).
 *   2. Resolve the correct send function (BNB native vs BEP-20 token).
 *   3. Send the transaction — sendToken / sendBnb wait for 1 confirmation.
 *   4. On success — record tx_hash, set status = 'confirmed', consume hold,
 *      create settlement journal entry, notify user.
 *   5. On failure — set status = 'failed' with failure_reason, release hold,
 *      notify user.
 */
import type { Sql } from "postgres";

import { getHotWalletKey } from "@/lib/blockchain/hotWallet";
import { sendToken, sendBnb, getTokenAddress } from "@/lib/blockchain/tokens";
import { enqueueOutbox } from "@/lib/outbox";
import { createNotification } from "@/lib/notifications";

/** Well-known system/omnibus ledger account owner (must match migration 007). */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

// ── Types ────────────────────────────────────────────────────────────
type WithdrawalRow = {
  id: string;
  user_id: string;
  asset_id: string;
  amount: string;
  destination_address: string;
  hold_id: string | null;
  status: string;
};

type AssetRow = {
  id: string;
  symbol: string;
  chain: string;
  contract_address: string | null;
  decimals: number;
};

// ── Public ───────────────────────────────────────────────────────────

/**
 * Broadcast a single approved withdrawal on-chain.
 * Caller must ensure the withdrawal is in 'approved' status.
 *
 * Throws on transient errors (outbox will retry with backoff).
 */
export async function handleWithdrawalBroadcast(
  sql: Sql,
  opts: { withdrawalId: string },
): Promise<void> {
  const { withdrawalId } = opts;

  // ── 1. Load & lock ───────────────────────────────────────────
  const locked = await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    // Attempt to transition approved → broadcasted atomically
    const rows = await txSql<WithdrawalRow[]>`
      UPDATE ex_withdrawal_request
      SET status = 'broadcasted', updated_at = now()
      WHERE id = ${withdrawalId} AND status = 'approved'
      RETURNING
        id,
        user_id::text AS user_id,
        asset_id::text AS asset_id,
        amount::text AS amount,
        destination_address,
        hold_id::text AS hold_id,
        status
    `;
    if (rows.length === 0) return null; // already handled or wrong status
    return rows[0]!;
  });

  if (!locked) return; // nothing to do — idempotent

  // ── 2. Resolve asset ─────────────────────────────────────────
  const assets = await sql<AssetRow[]>`
    SELECT id::text AS id, symbol, chain, contract_address, decimals
    FROM ex_asset
    WHERE id = ${locked.asset_id}
    LIMIT 1
  `;
  if (assets.length === 0) {
    await markFailed(sql, locked, "asset_not_found");
    return;
  }
  const asset = assets[0]!;

  // ── 3. Send on-chain ─────────────────────────────────────────
  let txHash: string;
  try {
    const hotKey = getHotWalletKey();

    if (asset.symbol.toUpperCase() === "BNB" && !asset.contract_address) {
      // Native BNB transfer
      const result = await sendBnb(hotKey, locked.destination_address, locked.amount);
      txHash = result.txHash;
    } else {
      // BEP-20 token transfer
      const tokenAddr = asset.contract_address ?? getTokenAddress(asset.symbol);
      if (!tokenAddr) {
        await markFailed(sql, locked, `no_contract_address_for_${asset.symbol}`);
        return;
      }
      const result = await sendToken(tokenAddr, hotKey, locked.destination_address, locked.amount, asset.decimals);
      txHash = result.txHash;
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await markFailed(sql, locked, reason);
    return;
  }

  // ── 4. Confirm — record hash, consume hold, journal, notify ──
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    await txSql`
      UPDATE ex_withdrawal_request
      SET status = 'confirmed', tx_hash = ${txHash}, updated_at = now()
      WHERE id = ${locked.id}
    `;

    // Consume the hold (funds are gone on-chain)
    if (locked.hold_id) {
      await txSql`
        UPDATE ex_hold
        SET status = 'consumed', remaining_amount = 0, released_at = now()
        WHERE id = ${locked.hold_id} AND status = 'active'
      `;
    }

    // Settlement journal entry: debit user account, credit system (balanced).
    // The hold was reserving these funds; now we finalize the debit.
    const systemAcct = await txSql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${SYSTEM_USER_ID}::uuid, ${locked.asset_id}::uuid)
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;

    const userAcct = await txSql<{ id: string }[]>`
      SELECT id FROM ex_ledger_account
      WHERE user_id = ${locked.user_id}::uuid AND asset_id = ${locked.asset_id}::uuid
      LIMIT 1
    `;

    if (userAcct.length > 0 && systemAcct.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entryRows = await (txSql as any)<{ id: string }[]>`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'withdrawal_settlement',
          ${"withdrawal:" + locked.id},
          ${{ withdrawal_id: locked.id, tx_hash: txHash, asset: asset.symbol }}::jsonb
        )
        RETURNING id
      `;
      const entryId = entryRows[0]!.id;

      await txSql`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${entryId}, ${userAcct[0]!.id}, ${locked.asset_id}::uuid, (${locked.amount}::numeric) * -1),
          (${entryId}, ${systemAcct[0]!.id}, ${locked.asset_id}::uuid, (${locked.amount}::numeric))
      `;
    }

    await enqueueOutbox(txSql, {
      topic: "ex.withdrawal.confirmed",
      aggregate_type: "withdrawal",
      aggregate_id: locked.id,
      payload: {
        withdrawal_id: locked.id,
        user_id: locked.user_id,
        tx_hash: txHash,
        asset_symbol: asset.symbol,
        amount: locked.amount,
      },
    });

    await createNotification(txSql, {
      userId: locked.user_id,
      type: "withdrawal_completed",
      title: "Withdrawal Confirmed",
      body: `Your withdrawal of ${locked.amount} ${asset.symbol} has been confirmed. TX: ${txHash.slice(0, 10)}…`,
      metadata: { withdrawalId: locked.id, txHash },
    });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

async function markFailed(sql: Sql, w: WithdrawalRow, reason: string): Promise<void> {
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    await txSql`
      UPDATE ex_withdrawal_request
      SET status = 'failed', failure_reason = ${reason}, updated_at = now()
      WHERE id = ${w.id}
    `;

    // Release the hold so the user can retry
    if (w.hold_id) {
      await txSql`
        UPDATE ex_hold
        SET status = 'released', released_at = now()
        WHERE id = ${w.hold_id} AND status = 'active'
      `;
    }

    await enqueueOutbox(txSql, {
      topic: "ex.withdrawal.failed",
      aggregate_type: "withdrawal",
      aggregate_id: w.id,
      payload: {
        withdrawal_id: w.id,
        user_id: w.user_id,
        failure_reason: reason,
      },
    });

    await createNotification(txSql, {
      userId: w.user_id,
      type: "system",
      title: "Withdrawal Failed",
      body: `Your withdrawal of ${w.amount} could not be completed: ${reason}`,
      metadata: { withdrawalId: w.id, failureReason: reason },
    });
  });
}
