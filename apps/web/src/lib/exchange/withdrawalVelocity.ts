import type { Sql } from "postgres";

import { toBigInt3818 } from "@/lib/exchange/fixed3818";

// ── Configurable velocity limits ────────────────────────────────────
// In production these should come from env / config; sensible defaults here.
const MAX_WITHDRAWALS_1H = Number(process.env.WITHDRAWAL_MAX_COUNT_1H) || 5;
const MAX_WITHDRAWALS_24H = Number(process.env.WITHDRAWAL_MAX_COUNT_24H) || 15;
/** Maximum total requested amount (string, numeric(38,18)) in a 24h window. 0 = unlimited. */
const MAX_AMOUNT_24H_STR = process.env.WITHDRAWAL_MAX_AMOUNT_24H ?? "0";

export type VelocityCheckResult =
  | { ok: true }
  | {
      ok: false;
      code: string;
      detail: {
        limit: number | string;
        current: number | string;
        window: string;
      };
    };

/**
 * Hard-limit velocity check that prevents the request from being accepted.
 * Must be called BEFORE the transaction that creates the withdrawal.
 *
 * Counts **all** non-failed statuses (requested, approved, broadcasted, confirmed)
 * so that a rapid burst of requests can't sneak through while earlier ones await approval.
 */
export async function checkWithdrawalVelocity(
  sql: Sql,
  userId: string,
  requestedAmount: string,
): Promise<VelocityCheckResult> {
  // ── Count-based limits ─────────────────────────────────────────────
  const rows = await sql<{ c1h: number; c24h: number; sum24h: string }[]>`
    SELECT
      count(*) FILTER (WHERE created_at >= now() - interval '1 hour')::int AS c1h,
      count(*)::int AS c24h,
      coalesce(sum(amount), 0)::text AS sum24h
    FROM ex_withdrawal_request
    WHERE user_id = ${userId}::uuid
      AND created_at >= now() - interval '24 hours'
      AND status NOT IN ('failed', 'canceled', 'rejected')
  `;

  const { c1h, c24h, sum24h } = rows[0] ?? { c1h: 0, c24h: 0, sum24h: "0" };

  if (c1h >= MAX_WITHDRAWALS_1H) {
    return {
      ok: false,
      code: "withdrawal_velocity_1h",
      detail: { limit: MAX_WITHDRAWALS_1H, current: c1h, window: "1h" },
    };
  }

  if (c24h >= MAX_WITHDRAWALS_24H) {
    return {
      ok: false,
      code: "withdrawal_velocity_24h",
      detail: { limit: MAX_WITHDRAWALS_24H, current: c24h, window: "24h" },
    };
  }

  // ── Amount-based 24h limit ─────────────────────────────────────────
  if (MAX_AMOUNT_24H_STR !== "0") {
    try {
      const maxAmount = toBigInt3818(MAX_AMOUNT_24H_STR);
      const currentSum = toBigInt3818(sum24h);
      const incoming = toBigInt3818(requestedAmount);

      if (currentSum + incoming > maxAmount) {
        return {
          ok: false,
          code: "withdrawal_amount_24h",
          detail: {
            limit: MAX_AMOUNT_24H_STR,
            current: sum24h,
            window: "24h",
          },
        };
      }
    } catch {
      // If parsing fails, skip amount check rather than blocking the user.
    }
  }

  return { ok: true };
}
