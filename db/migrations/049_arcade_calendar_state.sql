BEGIN;

-- Arcade calendar state (streak + pity counters).
-- Date: 2026-02-21

CREATE TABLE IF NOT EXISTS arcade_calendar_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  module text NOT NULL,

  streak_count integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_claim_date date NULL,

  -- Pity: counts how many claims since the last rare+ outcome.
  pity_rare integer NOT NULL DEFAULT 0,

  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, module)
);

COMMIT;
