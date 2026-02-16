-- External exchange API connections + copy trading schema
-- Users can connect Binance, Bybit, OKX etc. API keys
-- Date: 2026-02-06

BEGIN;

-- ── User exchange API connections ────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_exchange_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  exchange text NOT NULL,          -- 'binance' | 'bybit' | 'okx'
  label text NOT NULL DEFAULT '',  -- user-given name, e.g. "Main Binance"

  -- Encrypted API credentials (encrypted at rest via app layer)
  api_key_enc text NOT NULL,
  api_secret_enc text NOT NULL,
  passphrase_enc text NULL,        -- OKX requires passphrase

  -- Permissions detected or declared
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ['spot','margin','futures','withdraw']

  -- Status
  status text NOT NULL DEFAULT 'active',  -- active | disabled | invalid
  last_checked_at timestamptz NULL,
  last_error text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_user_exchange_label UNIQUE (user_id, exchange, label)
);

CREATE INDEX IF NOT EXISTS user_exchange_connection_user_idx
  ON user_exchange_connection(user_id, exchange);

-- ── Copy trading: leader profiles ────────────────────────────────────
CREATE TABLE IF NOT EXISTS copy_trading_leader (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) UNIQUE,
  display_name text NOT NULL,
  bio text NULL,
  is_public boolean NOT NULL DEFAULT false,
  total_followers integer NOT NULL DEFAULT 0,
  total_pnl_pct numeric NOT NULL DEFAULT 0,  -- rolling 30d PnL %
  win_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Copy trading: follower subscriptions ─────────────────────────────
CREATE TABLE IF NOT EXISTS copy_trading_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id uuid NOT NULL REFERENCES app_user(id),
  leader_id uuid NOT NULL REFERENCES copy_trading_leader(id),
  status text NOT NULL DEFAULT 'active', -- active | paused | stopped
  copy_ratio numeric NOT NULL DEFAULT 1.0 CHECK (copy_ratio > 0 AND copy_ratio <= 10),
  max_per_trade numeric NULL,  -- max amount per copied trade
  connection_id uuid NULL REFERENCES user_exchange_connection(id), -- which API to use
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_follower_leader UNIQUE (follower_user_id, leader_id)
);

CREATE INDEX IF NOT EXISTS copy_trading_sub_leader_idx
  ON copy_trading_subscription(leader_id) WHERE status = 'active';

-- ── Arbitrage price snapshots (for cross-exchange arb detection) ─────
CREATE TABLE IF NOT EXISTS arb_price_snapshot (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,           -- e.g. 'BTCUSDT'
  exchange text NOT NULL,         -- 'tradesynapse' | 'binance' | 'bybit'
  bid numeric NOT NULL,
  ask numeric NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arb_price_snapshot_symbol_ts_idx
  ON arb_price_snapshot(symbol, ts DESC);

-- Retention: only keep 24h of snapshots (cleanup via cron or app logic)

COMMIT;
