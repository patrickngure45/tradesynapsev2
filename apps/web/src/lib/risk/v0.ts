export type RiskRecommendedAction = "allow" | "friction" | "bond" | "hold" | "block";

export type RiskAssessmentV0Input = {
  payment_method_risk_class: "irreversible" | "reversible" | "unknown";
  price_deviation_pct: number | null;
  fair_band_pct: number | null;
  has_reference_snapshot: boolean;
};

export type RiskAssessmentV0Output = {
  score: number;
  recommended_action: RiskRecommendedAction;
  factors: Record<string, unknown>;
  version: "v0";
};

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function assessRiskV0(input: RiskAssessmentV0Input): RiskAssessmentV0Output {
  const factors: Record<string, unknown> = {
    payment_method_risk_class: input.payment_method_risk_class,
    price_deviation_pct: input.price_deviation_pct,
    fair_band_pct: input.fair_band_pct,
    has_reference_snapshot: input.has_reference_snapshot,
    rules: [],
  };

  let score = 0;

  // Payment method risk
  if (input.payment_method_risk_class === "reversible") {
    score += 35;
    (factors.rules as unknown[]).push({ code: "payment_reversible", delta: 35 });
  } else if (input.payment_method_risk_class === "unknown") {
    score += 15;
    (factors.rules as unknown[]).push({ code: "payment_unknown", delta: 15 });
  }

  // Market reference availability
  if (!input.has_reference_snapshot) {
    score += 15;
    (factors.rules as unknown[]).push({ code: "no_reference_snapshot", delta: 15 });
  }

  // Off-market quote deviation
  const d = input.price_deviation_pct;
  if (typeof d === "number" && Number.isFinite(d)) {
    if (d >= 0.1) {
      score += 70;
      (factors.rules as unknown[]).push({ code: "deviation_ge_10pct", delta: 70 });
    } else if (d >= 0.05) {
      score += 45;
      (factors.rules as unknown[]).push({ code: "deviation_ge_5pct", delta: 45 });
    } else if (d >= 0.02) {
      score += 25;
      (factors.rules as unknown[]).push({ code: "deviation_ge_2pct", delta: 25 });
    } else if (d >= 0.01) {
      score += 10;
      (factors.rules as unknown[]).push({ code: "deviation_ge_1pct", delta: 10 });
    }
  } else {
    score += 10;
    (factors.rules as unknown[]).push({ code: "deviation_unknown", delta: 10 });
  }

  score = clampInt(score, 0, 100);

  let recommended_action: RiskRecommendedAction = "allow";
  if (score >= 80) recommended_action = "block";
  else if (score >= 60) recommended_action = "hold";
  else if (score >= 40) recommended_action = "bond";
  else if (score >= 20) recommended_action = "friction";

  return {
    score,
    recommended_action,
    factors,
    version: "v0",
  };
}
