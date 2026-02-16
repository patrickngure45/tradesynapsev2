-- Exchange MVP: burn sink user
-- - Add a dedicated non-spendable system user to receive burned assets
-- Date: 2026-02-13

BEGIN;

-- Stable system users (reserved UUIDs)
-- 000...0003 is reserved as the "burn sink" user.
INSERT INTO app_user (id, status, kyc_level, country)
VALUES ('00000000-0000-0000-0000-000000000003'::uuid, 'active', 'none', NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;
