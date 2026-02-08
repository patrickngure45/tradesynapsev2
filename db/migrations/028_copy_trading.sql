BEGIN;

CREATE TABLE IF NOT EXISTS copy_trading_leader (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  bio text,
  is_public boolean NOT NULL DEFAULT false,
  total_followers integer NOT NULL DEFAULT 0,
  total_pnl_pct numeric(10,2) NOT NULL DEFAULT 0,
  win_rate numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT copy_trading_leader_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS copy_trading_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  leader_id uuid NOT NULL REFERENCES copy_trading_leader(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
  copy_ratio numeric(10,2) NOT NULL DEFAULT 1.0,
  max_per_trade numeric(38,18),
  connection_id uuid REFERENCES ex_api_connection(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT copy_trading_subscription_follower_leader_key UNIQUE (follower_user_id, leader_id)
);

-- Index for public leaderboard
CREATE INDEX IF NOT EXISTS copy_trading_leader_rank_idx ON copy_trading_leader(is_public, total_pnl_pct DESC);

COMMIT;
