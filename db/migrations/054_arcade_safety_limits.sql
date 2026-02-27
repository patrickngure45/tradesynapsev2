BEGIN;

-- Arcade safety limits: self-exclusion and spend limits.
-- Date: 2026-02-21

CREATE TABLE IF NOT EXISTS arcade_safety_limits (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,

  self_excluded_until timestamptz NULL,

  daily_action_limit integer NULL,
  daily_shard_spend_limit integer NULL,

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arcade_safety_self_excluded_idx
  ON arcade_safety_limits(self_excluded_until);

COMMIT;
