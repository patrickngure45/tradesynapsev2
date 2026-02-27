BEGIN;

-- P2P Disputes / Appeals
-- One dispute per order (append-only lifecycle via status + timestamps).

CREATE TABLE IF NOT EXISTS p2p_dispute (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES p2p_order(id) ON DELETE CASCADE,
  opened_by_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by_user_id uuid NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  resolution_note text NULL,
  resolution_outcome text NULL CHECK (resolution_outcome IN ('release', 'cancel')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT p2p_dispute_order_uniq UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS p2p_dispute_status_created_idx
  ON p2p_dispute(status, created_at DESC);

COMMIT;
