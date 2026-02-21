-- Exchange conditional orders (stop-limit)
-- Date: 2026-02-21

BEGIN;

CREATE TABLE IF NOT EXISTS ex_conditional_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  market_id uuid NOT NULL REFERENCES ex_market(id) ON DELETE RESTRICT,

  kind text NOT NULL CHECK (kind IN ('stop_limit')),
  side text NOT NULL CHECK (side IN ('buy','sell')),

  trigger_price numeric(38,18) NOT NULL CHECK (trigger_price > 0),
  limit_price numeric(38,18) NOT NULL CHECK (limit_price > 0),
  quantity numeric(38,18) NOT NULL CHECK (quantity > 0),

  status text NOT NULL CHECK (status IN ('active','triggering','triggered','canceled','failed')),
  attempt_count int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NULL,
  triggered_at timestamptz NULL,
  placed_order_id uuid NULL REFERENCES ex_order(id) ON DELETE SET NULL,
  failure_reason text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ex_conditional_order_scan_idx
  ON ex_conditional_order(status, market_id, created_at ASC);

CREATE INDEX IF NOT EXISTS ex_conditional_order_user_created_idx
  ON ex_conditional_order(user_id, created_at DESC);

COMMIT;
