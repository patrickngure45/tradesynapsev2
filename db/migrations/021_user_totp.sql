-- 2FA / TOTP support for app_user
-- Adds encrypted TOTP secret + enabled flag + backup codes

BEGIN;

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS totp_secret text,
  ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_backup_codes text[];

-- Audit when 2FA state changes
COMMENT ON COLUMN app_user.totp_secret IS 'Base32-encoded TOTP secret (encrypt at rest via app layer)';
COMMENT ON COLUMN app_user.totp_enabled IS 'True when user has completed 2FA setup and verified first code';
COMMENT ON COLUMN app_user.totp_backup_codes IS 'One-time backup codes (hashed) for account recovery';

COMMIT;
