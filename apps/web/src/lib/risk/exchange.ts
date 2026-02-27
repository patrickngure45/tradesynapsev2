import { toBigInt3818 } from "@/lib/exchange/fixed3818";

export type ExchangeWithdrawalRiskV0Input = {
  amount: string;
  available_amount?: string | null;
  asset_symbol?: string | null;
  destination_address?: string | null;
  allowlist_age_minutes?: number | null;
  user_withdrawals_1h?: number | null;
  user_withdrawals_24h?: number | null;
};

export type ExchangeWithdrawalRiskV0Output = {
  score: number;
  recommended_action: "allow" | "friction" | "hold" | "block";
  factors: Record<string, unknown>;
  version: "ex_withdrawal_v0";
};

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function assessExchangeWithdrawalRiskV0(
  input: ExchangeWithdrawalRiskV0Input
): ExchangeWithdrawalRiskV0Output {
  const factors: Record<string, unknown> = {
    amount: input.amount,
    asset_symbol: input.asset_symbol ?? null,
    destination_address: input.destination_address ?? null,
    available_amount: input.available_amount ?? null,
    allowlist_age_minutes:
      typeof input.allowlist_age_minutes === "number" && Number.isFinite(input.allowlist_age_minutes)
        ? input.allowlist_age_minutes
        : null,
    user_withdrawals_1h: input.user_withdrawals_1h ?? null,
    user_withdrawals_24h: input.user_withdrawals_24h ?? null,
    rules: [],
  };

  let score = 0;

  // Size heuristic (numeric(38,18) encoded as string)
  try {
    const amt = toBigInt3818(input.amount);
    const one = 1n * 10n ** 18n;
    const ten = 10n * one;
    const hundred = 100n * one;
    const thousand = 1000n * one;

    if (amt >= thousand) {
      score += 70;
      (factors.rules as unknown[]).push({ code: "amount_ge_1000", delta: 70 });
    } else if (amt >= hundred) {
      score += 45;
      (factors.rules as unknown[]).push({ code: "amount_ge_100", delta: 45 });
    } else if (amt >= ten) {
      score += 20;
      (factors.rules as unknown[]).push({ code: "amount_ge_10", delta: 20 });
    } else if (amt >= one) {
      score += 10;
      (factors.rules as unknown[]).push({ code: "amount_ge_1", delta: 10 });
    }
  } catch {
    score += 15;
    (factors.rules as unknown[]).push({ code: "amount_parse_failed", delta: 15 });
  }

  // Amount as fraction of available balance (pre-request)
  try {
    if (input.available_amount) {
      const available = toBigInt3818(input.available_amount);
      const amt = toBigInt3818(input.amount);
      if (available > 0n && amt > 0n) {
        // ratio in basis points, capped at 200%.
        const ratioBps = Number(((amt * 10_000n) / available) > 20_000n ? 20_000n : (amt * 10_000n) / available);
        if (ratioBps >= 9_500) {
          score += 50;
          (factors.rules as unknown[]).push({ code: "amount_ge_95pct_available", delta: 50, ratio_bps: ratioBps });
        } else if (ratioBps >= 7_500) {
          score += 35;
          (factors.rules as unknown[]).push({ code: "amount_ge_75pct_available", delta: 35, ratio_bps: ratioBps });
        } else if (ratioBps >= 5_000) {
          score += 20;
          (factors.rules as unknown[]).push({ code: "amount_ge_50pct_available", delta: 20, ratio_bps: ratioBps });
        }
      }
    }
  } catch {
    // ignore
  }

  // New allowlist entries are higher risk (social engineering patterns)
  if (typeof input.allowlist_age_minutes === "number" && Number.isFinite(input.allowlist_age_minutes)) {
    if (input.allowlist_age_minutes < 10) {
      score += 20;
      (factors.rules as unknown[]).push({ code: "allowlist_age_lt_10m", delta: 20 });
    } else if (input.allowlist_age_minutes < 60) {
      score += 10;
      (factors.rules as unknown[]).push({ code: "allowlist_age_lt_60m", delta: 10 });
    }
  }

  // Velocity heuristic
  if (typeof input.user_withdrawals_1h === "number" && Number.isFinite(input.user_withdrawals_1h)) {
    if (input.user_withdrawals_1h >= 3) {
      score += 25;
      (factors.rules as unknown[]).push({ code: "withdrawals_1h_ge_3", delta: 25 });
    } else if (input.user_withdrawals_1h >= 2) {
      score += 10;
      (factors.rules as unknown[]).push({ code: "withdrawals_1h_ge_2", delta: 10 });
    }
  }

  // Daily velocity heuristic
  if (typeof input.user_withdrawals_24h === "number" && Number.isFinite(input.user_withdrawals_24h)) {
    if (input.user_withdrawals_24h >= 10) {
      score += 40;
      (factors.rules as unknown[]).push({ code: "withdrawals_24h_ge_10", delta: 40 });
    } else if (input.user_withdrawals_24h >= 5) {
      score += 25;
      (factors.rules as unknown[]).push({ code: "withdrawals_24h_ge_5", delta: 25 });
    } else if (input.user_withdrawals_24h >= 3) {
      score += 10;
      (factors.rules as unknown[]).push({ code: "withdrawals_24h_ge_3", delta: 10 });
    }
  }

  score = clampInt(score, 0, 100);

  let recommended_action: ExchangeWithdrawalRiskV0Output["recommended_action"] = "allow";
  if (score >= 85) recommended_action = "block";
  else if (score >= 60) recommended_action = "hold";
  else if (score >= 25) recommended_action = "friction";

  return {
    score,
    recommended_action,
    factors,
    version: "ex_withdrawal_v0",
  };
}
