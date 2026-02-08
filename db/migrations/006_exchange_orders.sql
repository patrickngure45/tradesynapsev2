-- Exchange MVP: markets + limit orders + executions
-- Date: 2026-02-05

BEGIN;

CREATE TABLE IF NOT EXISTS ex_market (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL CHECK (chain IN ('bsc')),
  symbol text NOT NULL, -- e.g. 'TST/USDT'
  base_asset_id uuid NOT NULL REFERENCES ex_asset(id) ON DELETE RESTRICT,
  quote_asset_id uuid NOT NULL REFERENCES ex_asset(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled')),
  tick_size numeric(38,18) NOT NULL DEFAULT 0.00000001,
  lot_size numeric(38,18) NOT NULL DEFAULT 0.00000001,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ex_market_chain_symbol_uniq UNIQUE (chain, symbol),
  CONSTRAINT ex_market_base_quote_uniq UNIQUE (chain, base_asset_id, quote_asset_id)
);

CREATE INDEX IF NOT EXISTS ex_market_enabled_idx ON ex_market(chain, status);

CREATE TABLE IF NOT EXISTS ex_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES ex_market(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  type text NOT NULL DEFAULT 'limit' CHECK (type IN ('limit')),
  price numeric(38,18) NOT NULL CHECK (price > 0),
  quantity numeric(38,18) NOT NULL CHECK (quantity > 0),
  remaining_quantity numeric(38,18) NOT NULL CHECK (remaining_quantity >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partially_filled','filled','canceled')),
  hold_id uuid NULL REFERENCES ex_hold(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ex_order_user_created_idx ON ex_order(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ex_order_market_status_idx ON ex_order(market_id, status);

-- Maker selection indexes (price-time priority)
CREATE INDEX IF NOT EXISTS ex_order_market_sellbook_idx
  ON ex_order(market_id, status, price ASC, created_at ASC)
  WHERE side = 'sell' AND status IN ('open','partially_filled');

CREATE INDEX IF NOT EXISTS ex_order_market_buybook_idx
  ON ex_order(market_id, status, price DESC, created_at ASC)
  WHERE side = 'buy' AND status IN ('open','partially_filled');

CREATE TABLE IF NOT EXISTS ex_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES ex_market(id) ON DELETE RESTRICT,
  price numeric(38,18) NOT NULL CHECK (price > 0),
  quantity numeric(38,18) NOT NULL CHECK (quantity > 0),
  maker_order_id uuid NOT NULL REFERENCES ex_order(id) ON DELETE RESTRICT,
  taker_order_id uuid NOT NULL REFERENCES ex_order(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ex_execution_market_created_idx ON ex_execution(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ex_execution_maker_idx ON ex_execution(maker_order_id);
CREATE INDEX IF NOT EXISTS ex_execution_taker_idx ON ex_execution(taker_order_id);

COMMIT;
