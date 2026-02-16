BEGIN;

-- FX reference rates (computed by app code; cached for guardrails and auditability)
CREATE TABLE IF NOT EXISTS fx_reference_rate (
  id bigserial PRIMARY KEY,
  base_symbol text NOT NULL,
  quote_symbol text NOT NULL,
  bid numeric(38,18) NOT NULL,
  ask numeric(38,18) NOT NULL,
  mid numeric(38,18) NOT NULL,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  CONSTRAINT fx_reference_rate_symbols_chk CHECK (length(base_symbol) >= 2 AND length(quote_symbol) >= 2),
  CONSTRAINT fx_reference_rate_spread_chk CHECK (bid > 0 AND ask > 0 AND mid > 0 AND bid <= mid AND mid <= ask)
);

CREATE INDEX IF NOT EXISTS fx_reference_rate_pair_time_idx
  ON fx_reference_rate(base_symbol, quote_symbol, computed_at DESC);

CREATE INDEX IF NOT EXISTS fx_reference_rate_valid_idx
  ON fx_reference_rate(base_symbol, quote_symbol, valid_until DESC);

-- Store pricing guardrail metadata on ads for later dispute/audit.
ALTER TABLE p2p_ad
  ADD COLUMN IF NOT EXISTS reference_mid numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS reference_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_computed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS price_band_pct numeric(10,6) NULL;

COMMIT;
