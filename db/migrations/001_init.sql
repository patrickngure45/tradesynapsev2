-- ProofPack MVP: initial schema
-- Date: 2026-02-03

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users
CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('active','restricted','banned')),
  kyc_level text NOT NULL CHECK (kyc_level IN ('none','basic','full')),
  country text NULL
);

-- Wallets (optional for MVP; useful when adding on-chain settlement)
CREATE TABLE IF NOT EXISTS wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  chain text NOT NULL,
  address text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('deposit','withdraw','escrow')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_user_chain_address_uniq UNIQUE (user_id, chain, address, purpose)
);

-- Counterparty stats (optional; placeholder for reputation signals)
CREATE TABLE IF NOT EXISTS counterparty_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE RESTRICT,
  completed_trades integer NOT NULL DEFAULT 0,
  completion_rate numeric(5,4) NULL,
  dispute_rate numeric(5,4) NULL,
  last_active_at timestamptz NULL
);

-- Market snapshots (cache of public exchange data; optional but recommended)
CREATE TABLE IF NOT EXISTS market_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange text NOT NULL CHECK (exchange IN ('binance','bybit','other')),
  symbol text NOT NULL,
  last numeric(38,18) NULL,
  bid numeric(38,18) NULL,
  ask numeric(38,18) NULL,
  ts timestamptz NOT NULL,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_snapshot_lookup_idx
  ON market_snapshot(exchange, symbol, ts DESC);

-- Trades
CREATE TABLE IF NOT EXISTS trade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  seller_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  fiat_currency text NOT NULL,
  crypto_asset text NOT NULL,
  fiat_amount numeric(20,2) NOT NULL,
  crypto_amount numeric(38,18) NOT NULL,
  price numeric(38,18) NOT NULL,
  payment_method_label text NOT NULL,
  payment_method_risk_class text NOT NULL CHECK (payment_method_risk_class IN ('irreversible','reversible','unknown')),
  status text NOT NULL CHECK (status IN ('created','awaiting_payment','paid_marked','released','disputed','resolved','canceled')),
  reference_market_snapshot_id uuid NULL REFERENCES market_snapshot(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  paid_marked_at timestamptz NULL,
  released_at timestamptz NULL,
  canceled_at timestamptz NULL,
  CONSTRAINT trade_buyer_seller_distinct CHECK (buyer_user_id <> seller_user_id)
);

CREATE INDEX IF NOT EXISTS trade_buyer_idx ON trade(buyer_user_id);
CREATE INDEX IF NOT EXISTS trade_seller_idx ON trade(seller_user_id);
CREATE INDEX IF NOT EXISTS trade_status_created_idx ON trade(status, created_at DESC);

-- Audit trail of transitions
CREATE TABLE IF NOT EXISTS trade_state_transition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trade(id) ON DELETE RESTRICT,
  from_status text NULL,
  to_status text NOT NULL,
  actor_user_id uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user','system')),
  reason_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_state_transition_trade_idx
  ON trade_state_transition(trade_id, created_at ASC);

-- Messages (optional; can be populated by manual copy/paste or extension later)
CREATE TABLE IF NOT EXISTS message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trade(id) ON DELETE RESTRICT,
  sender_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  body text NOT NULL,
  contains_link boolean NOT NULL DEFAULT false,
  contains_offplatform_handle boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_trade_idx ON message(trade_id, created_at ASC);

-- Evidence objects (immutable blobs referenced by URI + hash)
CREATE TABLE IF NOT EXISTS evidence_object (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trade(id) ON DELETE RESTRICT,
  submitted_by_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('receipt','screenshot','bank_sms','chat_export','other')),
  storage_uri text NOT NULL,
  sha256 text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_trade_hash_uniq UNIQUE (trade_id, sha256)
);

CREATE INDEX IF NOT EXISTS evidence_object_trade_idx
  ON evidence_object(trade_id, created_at ASC);

-- Risk assessments (versioned, immutable)
CREATE TABLE IF NOT EXISTS risk_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trade(id) ON DELETE RESTRICT,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  version text NOT NULL,
  factors_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_action text NOT NULL CHECK (recommended_action IN ('allow','friction','bond','hold','block')),
  market_snapshot_id uuid NULL REFERENCES market_snapshot(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_assessment_trade_idx
  ON risk_assessment(trade_id, created_at DESC);

-- Disputes
CREATE TABLE IF NOT EXISTS dispute (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL UNIQUE REFERENCES trade(id) ON DELETE RESTRICT,
  opened_by_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (reason_code IN ('non_payment','chargeback','phishing','other')),
  status text NOT NULL CHECK (status IN ('open','needs_more_evidence','in_review','resolved','appealed','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS dispute_status_opened_idx
  ON dispute(status, opened_at DESC);

CREATE TABLE IF NOT EXISTS dispute_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES dispute(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('release_to_buyer','refund_buyer','release_to_seller','cancel_trade')),
  rationale text NULL,
  decided_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispute_decision_dispute_idx
  ON dispute_decision(dispute_id, created_at ASC);

-- Optional on-chain events
CREATE TABLE IF NOT EXISTS onchain_tx (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trade(id) ON DELETE RESTRICT,
  chain text NOT NULL,
  tx_hash text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('deposit','release','dispute_opened','resolved')),
  block_number bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onchain_tx_chain_hash_uniq UNIQUE (chain, tx_hash, event_type)
);

CREATE INDEX IF NOT EXISTS onchain_tx_trade_idx
  ON onchain_tx(trade_id, created_at ASC);

COMMIT;
