import type { Sql } from "postgres";

import { assessExchangeWithdrawalRiskV0 } from "@/lib/risk/exchange";

export async function handleWithdrawalRequestedRiskSignal(
  sql: Sql,
  opts: { withdrawalId: string }
): Promise<void> {
  const rows = await sql<
    {
      id: string;
      user_id: string;
      asset_id: string;
      amount: string;
      destination_address: string;
      hold_id: string | null;
      allowlist_created_at: string | null;
      asset_symbol: string | null;
    }[]
  >`
    SELECT
      w.id,
      w.user_id,
      w.asset_id,
      w.amount::text AS amount,
      w.destination_address,
      w.hold_id,
      al.created_at::text AS allowlist_created_at,
      a.symbol AS asset_symbol
    FROM ex_withdrawal_request w
    JOIN ex_asset a ON a.id = w.asset_id
    LEFT JOIN ex_withdrawal_allowlist al ON al.id = w.allowlist_id
    WHERE w.id = ${opts.withdrawalId}::uuid
    LIMIT 1
  `;

  const w = rows[0];
  if (!w) return;

  const allowlistAgeMinutes = (() => {
    if (!w.allowlist_created_at) return null;
    const t = Date.parse(w.allowlist_created_at);
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 60_000));
  })();

  const count1hRows = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c
    FROM ex_withdrawal_request
    WHERE user_id = ${w.user_id}::uuid
      AND created_at >= (now() - interval '1 hour')
  `;
  const userWithdrawals1h = count1hRows[0]?.c ?? 0;

  const countRows = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c
    FROM ex_withdrawal_request
    WHERE user_id = ${w.user_id}::uuid
      AND created_at >= (now() - interval '24 hours')
  `;
  const userWithdrawals24h = countRows[0]?.c ?? 0;

  const balanceRows = await sql<{ available: string }[]>`
    WITH acct AS (
      SELECT id
      FROM ex_ledger_account
      WHERE user_id = ${w.user_id}::uuid AND asset_id = ${w.asset_id}::uuid
      LIMIT 1
    ),
    posted AS (
      SELECT coalesce(sum(amount), 0)::numeric AS posted
      FROM ex_journal_line
      WHERE account_id = (SELECT id FROM acct)
    ),
    held AS (
      SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
      FROM ex_hold
      WHERE account_id = (SELECT id FROM acct)
        AND status = 'active'
        AND (${w.hold_id}::uuid IS NULL OR id <> ${w.hold_id}::uuid)
    )
    SELECT (posted.posted - held.held)::text AS available
    FROM posted, held
  `;
  const availableAmount = balanceRows[0]?.available ?? null;

  const assessment = assessExchangeWithdrawalRiskV0({
    amount: w.amount,
    available_amount: availableAmount,
    asset_symbol: w.asset_symbol ?? null,
    destination_address: w.destination_address ?? null,
    allowlist_age_minutes: allowlistAgeMinutes,
    user_withdrawals_1h: userWithdrawals1h,
    user_withdrawals_24h: userWithdrawals24h,
  });

  await sql`
    INSERT INTO app_signal (subject_type, subject_id, kind, score, recommended_action, model_version, payload_json)
    VALUES (
      'withdrawal',
      ${opts.withdrawalId},
      'risk_assessment',
      ${assessment.score},
      ${assessment.recommended_action},
      ${assessment.version},
      jsonb_build_object('factors', ${JSON.stringify(assessment.factors)}::jsonb)
    )
  `;

  if (assessment.recommended_action === "hold" || assessment.recommended_action === "block") {
    await sql`
      UPDATE ex_withdrawal_request
      SET status = 'needs_review', updated_at = now()
      WHERE id = ${opts.withdrawalId}::uuid
        AND status = 'requested'
    `;
  }
}
