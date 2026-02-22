-- TWAP scheduler (spot)
-- Date: 2026-02-22

BEGIN;

CREATE TABLE IF NOT EXISTS app_twap_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES ex_market(id) ON DELETE RESTRICT,
  side text NOT NULL CHECK (side IN ('buy','sell')),

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','canceled','completed')),

  total_quantity numeric(38,18) NOT NULL CHECK (total_quantity > 0),
  remaining_quantity numeric(38,18) NOT NULL CHECK (remaining_quantity >= 0),
  slice_quantity numeric(38,18) NOT NULL CHECK (slice_quantity > 0),
  interval_sec int NOT NULL CHECK (interval_sec >= 10 AND interval_sec <= 24*60*60),

  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz NULL,

  auth_expires_at timestamptz NULL,

  last_run_status text NULL CHECK (last_run_status IN ('success','failed','skipped')),
  last_run_error text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_twap_plan_user_idx
  ON app_twap_plan(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_twap_plan_due_idx
  ON app_twap_plan(status, next_run_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS app_twap_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES app_twap_plan(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES ex_market(id) ON DELETE RESTRICT,
  side text NOT NULL CHECK (side IN ('buy','sell')),

  scheduled_for timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,

  status text NOT NULL CHECK (status IN ('success','failed','skipped')),
  error text NULL,

  slice_quantity numeric(38,18) NOT NULL,
  order_id uuid NULL,
  fills_count int NULL
);

CREATE INDEX IF NOT EXISTS app_twap_run_plan_idx
  ON app_twap_run(plan_id, started_at DESC);

CREATE INDEX IF NOT EXISTS app_twap_run_user_idx
  ON app_twap_run(user_id, started_at DESC);

COMMIT;
