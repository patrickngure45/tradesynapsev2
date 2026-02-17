-- P2P feedback indexes for reputation queries
-- Date: 2026-02-17

BEGIN;

CREATE INDEX IF NOT EXISTS p2p_feedback_to_user_created_idx
  ON p2p_feedback (to_user_id, created_at DESC);

COMMIT;
