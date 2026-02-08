-- Add HD derivation index to deposit addresses for wallet generation
-- Date: 2026-02-06

BEGIN;

ALTER TABLE ex_deposit_address
  ADD COLUMN IF NOT EXISTS derivation_index integer NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ex_deposit_address_chain_deriv_idx
  ON ex_deposit_address(chain, derivation_index)
  WHERE derivation_index IS NOT NULL;

COMMIT;
