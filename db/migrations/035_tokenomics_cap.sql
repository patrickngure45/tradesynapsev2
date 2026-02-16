-- Exchange MVP: tokenomics helpers
-- - Add a dedicated cap/equity user to represent fixed-supply backing in the ledger
-- - Add a legacy utility/gas token asset
-- Date: 2026-02-13

BEGIN;

-- Stable system users (reserved UUIDs)
-- 000...0001 is already used as the main system user (fees/settlement/dev credits).
-- 000...0002 is introduced as a "cap/equity" counterparty for fixed-supply initialization.
INSERT INTO app_user (id, status, kyc_level, country)
VALUES ('00000000-0000-0000-0000-000000000002'::uuid, 'active', 'none', NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;
