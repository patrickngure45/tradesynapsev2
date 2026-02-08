export type ProofPackFileEntry = {
  path: string;
  bytes: number;
  sha256: string;
  mime: string;
};

export type ProofPackManifestV1 = {
  manifest_version: "proofpack.manifest.v1";
  generated_at: string;
  trade_id: string;
  includes: {
    trade: boolean;
    transitions: boolean;
    risk_assessment_latest: boolean;
    reference_market_snapshot: boolean;
    evidence_objects: boolean;
    dispute: boolean;
    dispute_decisions: boolean;
    evidence_missing: boolean;
  };
  files: ProofPackFileEntry[];
  summary: {
    trade: {
      status: string;
      terminal_status: string | null;
      latest_transition: {
        from_status: string | null;
        to_status: string;
        actor_user_id: string | null;
        actor_type: string;
        reason_code: string | null;
        created_at: string;
      } | null;
      latest_dispute_decision: {
        decision: string;
        decided_by: string;
        created_at: string;
      } | null;
    };
    risk_score: number | null;
    recommended_action: string | null;
    price_deviation_pct: string | null;
    evidence_completeness: {
      score: number;
      evidence_count: number;
      evidence_types: string[];
      missing_recommendations: string[];
    };
    dispute: {
      status: string | null;
      reason_code: string | null;
      opened_at: string | null;
      resolved_at: string | null;
      decisions_count: number;
    };
  };
};
