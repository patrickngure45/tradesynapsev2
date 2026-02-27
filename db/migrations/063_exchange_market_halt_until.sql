-- Exchange: circuit breaker support (temporary market halt)
-- Date: 2026-02-22

BEGIN;

ALTER TABLE ex_market
  ADD COLUMN IF NOT EXISTS halt_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS ex_market_halt_until_idx
  ON ex_market(halt_until);

COMMIT;
