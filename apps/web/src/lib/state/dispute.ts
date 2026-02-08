export type DisputeStatus =
  | "open"
  | "needs_more_evidence"
  | "in_review"
  | "appealed"
  | "resolved";

export function isDisputeStatus(status: string): status is DisputeStatus {
  return (
    status === "open" ||
    status === "needs_more_evidence" ||
    status === "in_review" ||
    status === "appealed" ||
    status === "resolved"
  );
}

/**
 * Explicit allowed transitions for the dispute state machine.
 *
 *   open → needs_more_evidence | in_review | resolved
 *   needs_more_evidence → open | in_review | resolved
 *   in_review → needs_more_evidence | resolved | appealed
 *   appealed → in_review | resolved
 *   resolved → (terminal)
 */
export const DISPUTE_ALLOWED_TRANSITIONS: Record<DisputeStatus, readonly DisputeStatus[]> = {
  open: ["needs_more_evidence", "in_review", "resolved"],
  needs_more_evidence: ["open", "in_review", "resolved"],
  in_review: ["needs_more_evidence", "resolved", "appealed"],
  appealed: ["in_review", "resolved"],
  resolved: [],
} as const;

export function canTransitionDispute(from: string, to: DisputeStatus): boolean {
  if (!isDisputeStatus(from)) return false;
  return DISPUTE_ALLOWED_TRANSITIONS[from].includes(to);
}

export function isOpenLikeDisputeStatus(status: string): status is Exclude<DisputeStatus, "resolved"> {
  return status === "open" || status === "needs_more_evidence" || status === "in_review" || status === "appealed";
}
