BEGIN;

-- Bot execution records (supports simulation-first, with optional live trading later)

CREATE TABLE IF NOT EXISTS trading_bot_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

  -- Strategy kind, e.g. cash_and_carry (single-exchange) / cross_exchange (future)
  kind text NOT NULL,

  -- High-level lifecycle
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),

  -- Optional linkage to the signal that triggered the run
  signal_id uuid NULL REFERENCES app_signal(id) ON DELETE SET NULL,

  -- Strategy parameters
  exchange text NULL,
  symbol text NULL,
  amount_usd numeric(38, 18) NULL,
  leverage numeric(38, 18) NULL,

  params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  error text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trading_bot_execution_params_object_chk'
  ) THEN
    ALTER TABLE trading_bot_execution
      ADD CONSTRAINT trading_bot_execution_params_object_chk
      CHECK (jsonb_typeof(params_json) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trading_bot_execution_result_object_chk'
  ) THEN
    ALTER TABLE trading_bot_execution
      ADD CONSTRAINT trading_bot_execution_result_object_chk
      CHECK (jsonb_typeof(result_json) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS trading_bot_execution_user_created_idx
  ON trading_bot_execution(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS trading_bot_execution_status_created_idx
  ON trading_bot_execution(status, created_at DESC);

COMMIT;
