BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- P2P Module: Payment Methods, Ads, Orders (Escrow), Chat
-- ══════════════════════════════════════════════════════════════════

-- 1. Payment Methods
-- Users can save multiple payment methods (Bank Transfer, PayPal, etc.)
CREATE TABLE IF NOT EXISTS p2p_payment_method (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  
  identifier text NOT NULL, -- e.g. 'Bank Transfer', 'Revolut'
  name text NOT NULL,       -- User label: 'My Chase Checking'
  details jsonb NOT NULL,   -- Encrypted fields ideally, or just raw for MVP: { "account_number": "...", "bank_name": "..." }
  
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS p2p_payment_method_user_idx ON p2p_payment_method(user_id);


-- 2. P2P Ads (Maker Offers)
-- "I want to BUY USDT for USD" or "I want to SELL TST for NGN"
CREATE TABLE IF NOT EXISTS p2p_ad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),  -- Advertiser's intent
  asset_id uuid NOT NULL REFERENCES ex_asset(id) ON DELETE RESTRICT, -- The crypto asset
  fiat_currency text NOT NULL, -- 'USD', 'EUR', 'NGN', etc.
  
  -- Pricing
  price_type text NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'floating')),
  fixed_price numeric NULL CHECK (fixed_price > 0),    -- active if price_type='fixed'
  margin_percent numeric NULL,                         -- active if price_type='floating' (e.g. 1.05 = +5% over market)
  
  -- Limits & Liquidity
  total_amount numeric NOT NULL CHECK (total_amount > 0),
  remaining_amount numeric NOT NULL CHECK (remaining_amount >= 0),
  min_limit numeric NOT NULL CHECK (min_limit >= 0),   -- Min fiat amount per trade
  max_limit numeric NOT NULL CHECK (max_limit > 0),    -- Max fiat amount per trade
  
  -- Payment settings
  payment_method_ids jsonb NOT NULL DEFAULT '[]',      -- Array of p2p_payment_method IDs accepted
  payment_window_minutes integer NOT NULL DEFAULT 15,  -- How long buyer has to pay
  
  -- Text configs
  terms text,          -- "No third party payments"
  auto_reply text,     -- Message sent when order opens
  
  -- State
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'closed')),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS p2p_ad_market_idx ON p2p_ad(asset_id, fiat_currency, side, status);
CREATE INDEX IF NOT EXISTS p2p_ad_user_idx ON p2p_ad(user_id);


-- 3. P2P Orders (The Trade / Escrow)
CREATE TABLE IF NOT EXISTS p2p_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES p2p_ad(id),
  
  -- Roles
  maker_id uuid NOT NULL REFERENCES app_user(id), -- Owner of the ad
  taker_id uuid NOT NULL REFERENCES app_user(id), -- User who clicked the ad
  buyer_id uuid NOT NULL REFERENCES app_user(id), -- Computed: who gets crypto?
  seller_id uuid NOT NULL REFERENCES app_user(id),-- Computed: who gives crypto?
  
  -- Asset Specs
  asset_id uuid NOT NULL REFERENCES ex_asset(id),
  amount_asset numeric NOT NULL, -- Crypto amount locked in escrow
  price numeric NOT NULL,        -- Unit price execution
  amount_fiat numeric NOT NULL,  -- Fiat amount to transfer
  fiat_currency text NOT NULL,
  
  -- State Machine
  -- created: Order active, crypto ESCROWED (if seller has funds). Waiting for payment.
  -- paid: Buyer clicked "I have paid". Seller needs to release.
  -- completed: Crypto released to Buyer. Trade done.
  -- cancelled: Buyer cancelled OR timeout. Crypto returned to Seller.
  -- disputed: Admin intervention requested.
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid_confirmed', 'completed', 'cancelled', 'disputed')),
  
  -- Snapshot of payment details for this specific trade
  payment_method_snapshot jsonb NOT NULL, 
  
  -- Internal Refs
  escrow_hold_id uuid, -- Reference to ex_hold (ledger) if we lock funds
  
  -- Timings
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL, -- When does it auto-cancel if not paid?
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  
  CONSTRAINT p2p_order_roles_check CHECK (buyer_id <> seller_id)
);
CREATE INDEX IF NOT EXISTS p2p_order_status_idx ON p2p_order(status);
CREATE INDEX IF NOT EXISTS p2p_order_users_idx ON p2p_order(buyer_id, seller_id);


-- 4. P2P Chat
CREATE TABLE IF NOT EXISTS p2p_chat_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES p2p_order(id) ON DELETE CASCADE,
  sender_id uuid NULL REFERENCES app_user(id), -- NULL = System Message
  
  content text NOT NULL,
  is_image boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS p2p_chat_order_idx ON p2p_chat_message(order_id, created_at);


-- 5. Feedback / Reputation
CREATE TABLE IF NOT EXISTS p2p_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES p2p_order(id),
  from_user_id uuid NOT NULL REFERENCES app_user(id),
  to_user_id uuid NOT NULL REFERENCES app_user(id),
  
  rating text NOT NULL CHECK (rating IN ('positive', 'negative')),
  comment text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2p_feedback_uniq UNIQUE (order_id, from_user_id)
);

COMMIT;
