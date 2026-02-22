-- Recurring buys (DCA)
-- Date: 2026-02-22

BEGIN;

CREATE TABLE IF NOT EXISTS app_recurring_buy_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','canceled')),

  from_symbol text NOT NULL,
  to_symbol text NOT NULL,
  amount_in numeric(38,18) NOT NULL CHECK (amount_in > 0),

  cadence text NOT NULL CHECK (cadence IN ('daily','weekly')),
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz NULL,

  -- Authorization window for automation when strong auth is enabled.
  auth_expires_at timestamptz NULL,

  -- Last run summary (for UI)
  last_run_status text NULL CHECK (last_run_status IN ('success','failed')),
  last_run_error text NULL,
  last_entry_id uuid NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_recurring_buy_plan_user_idx
  ON app_recurring_buy_plan(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_recurring_buy_plan_due_idx
  ON app_recurring_buy_plan(status, next_run_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS app_recurring_buy_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES app_recurring_buy_plan(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

  scheduled_for timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,

  status text NOT NULL CHECK (status IN ('success','failed','skipped')),
  error text NULL,

  entry_id uuid NULL,
  from_symbol text NOT NULL,
  to_symbol text NOT NULL,
  amount_in numeric(38,18) NOT NULL,
  amount_out numeric(38,18) NULL,
  rate_to_per_from numeric(38,18) NULL
);

CREATE INDEX IF NOT EXISTS app_recurring_buy_run_plan_idx
  ON app_recurring_buy_run(plan_id, started_at DESC);

CREATE INDEX IF NOT EXISTS app_recurring_buy_run_user_idx
  ON app_recurring_buy_run(user_id, started_at DESC);

COMMIT;
