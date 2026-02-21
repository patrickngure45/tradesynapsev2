BEGIN;

-- Arcade / Uncertainty foundation tables.
-- Provides a shared commit→reveal action log, daily claim limiter, and a simple inventory table.
-- Date: 2026-02-21

CREATE TABLE IF NOT EXISTS arcade_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

  module text NOT NULL,
  profile text NOT NULL DEFAULT 'low',

  status text NOT NULL DEFAULT 'committed',

  -- Commit / reveal fairness
  client_commit_hash text NOT NULL,
  server_commit_hash text NOT NULL,
  server_seed_b64 text NOT NULL,

  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reveal_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  requested_at timestamptz NOT NULL DEFAULT now(),
  resolves_at timestamptz NULL,
  resolved_at timestamptz NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_action_input_object_chk') THEN
    ALTER TABLE arcade_action
      ADD CONSTRAINT arcade_action_input_object_chk
      CHECK (jsonb_typeof(input_json) = 'object');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_action_reveal_object_chk') THEN
    ALTER TABLE arcade_action
      ADD CONSTRAINT arcade_action_reveal_object_chk
      CHECK (jsonb_typeof(reveal_json) = 'object');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_action_outcome_object_chk') THEN
    ALTER TABLE arcade_action
      ADD CONSTRAINT arcade_action_outcome_object_chk
      CHECK (jsonb_typeof(outcome_json) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS arcade_action_user_requested_idx
  ON arcade_action(user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS arcade_action_pending_resolve_idx
  ON arcade_action(status, resolves_at ASC, requested_at ASC)
  WHERE status IN ('committed', 'scheduled');


CREATE TABLE IF NOT EXISTS arcade_daily_claim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  module text NOT NULL,
  claim_date date NOT NULL,
  action_id uuid NOT NULL REFERENCES arcade_action(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, module, claim_date),
  UNIQUE (action_id)
);

CREATE INDEX IF NOT EXISTS arcade_daily_claim_user_date_idx
  ON arcade_daily_claim(user_id, claim_date DESC);


CREATE TABLE IF NOT EXISTS arcade_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

  kind text NOT NULL,
  code text NOT NULL,
  rarity text NOT NULL,

  quantity integer NOT NULL DEFAULT 1,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_inventory_metadata_object_chk') THEN
    ALTER TABLE arcade_inventory
      ADD CONSTRAINT arcade_inventory_metadata_object_chk
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS arcade_inventory_user_kind_idx
  ON arcade_inventory(user_id, kind, updated_at DESC);

-- Keep duplicates collapsed (same badge/perk stacks).
CREATE UNIQUE INDEX IF NOT EXISTS arcade_inventory_user_unique_item
  ON arcade_inventory(user_id, kind, code, rarity);

COMMIT;
