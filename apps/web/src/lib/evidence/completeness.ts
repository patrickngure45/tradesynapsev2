export type EvidenceLike = {
  type: string;
  metadata_json?: unknown;
};

export type EvidenceCompleteness = {
  score: number;
  evidence_count: number;
  evidence_types: string[];
  missing_recommendations: string[];
};

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export function computeEvidenceCompleteness(evidence: EvidenceLike[]): EvidenceCompleteness {
  const evidenceTypes = uniqSorted(
    evidence
      .map((e) => (typeof e?.type === "string" ? e.type : ""))
      .filter(Boolean)
  );

  const has = (t: string) => evidenceTypes.includes(t);

  const evidence_count = evidence.length;
  if (evidence_count === 0) {
    return {
      score: 0,
      evidence_count,
      evidence_types: evidenceTypes,
      missing_recommendations: [
        "upload a payment proof (receipt/bank_sms)",
        "upload chat export",
      ],
    };
  }

  let score = 0;

  if (has("receipt") || has("bank_sms")) score += 40;
  if (has("chat_export")) score += 30;
  if (has("screenshot")) score += 20;
  if (evidence_count >= 2) score += 10;

  score = Math.max(0, Math.min(100, score));

  const missing_recommendations: string[] = [];
  if (!has("receipt") && !has("bank_sms")) {
    missing_recommendations.push("upload a payment proof (receipt/bank_sms)");
  }
  if (!has("chat_export")) missing_recommendations.push("upload chat export");
  if (!has("screenshot")) missing_recommendations.push("upload screenshots");

  return {
    score,
    evidence_count,
    evidence_types: evidenceTypes,
    missing_recommendations,
  };
}
