-- 048: Passkeys (WebAuthn)
-- Adds passkey credential storage + short-lived WebAuthn challenges
-- Date: 2026-02-20

BEGIN;

CREATE TABLE IF NOT EXISTS user_passkey_credential (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name text,
  credential_id bytea NOT NULL,
  public_key bytea NOT NULL,
  counter integer NOT NULL DEFAULT 0,
  transports text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS user_passkey_credential_credential_id_uq
  ON user_passkey_credential (credential_id);

CREATE INDEX IF NOT EXISTS user_passkey_credential_user_id_idx
  ON user_passkey_credential (user_id);

COMMENT ON TABLE user_passkey_credential IS 'WebAuthn passkey credentials for passwordless auth and step-up security.';
COMMENT ON COLUMN user_passkey_credential.credential_id IS 'Raw credential ID (bytea). Unique per authenticator credential.';
COMMENT ON COLUMN user_passkey_credential.public_key IS 'Raw credential public key (COSE).';
COMMENT ON COLUMN user_passkey_credential.counter IS 'Signature counter for replay protection.';

CREATE TABLE IF NOT EXISTS webauthn_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind text NOT NULL,
  challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webauthn_challenge
  ADD CONSTRAINT webauthn_challenge_kind_check
  CHECK (kind IN ('register', 'authenticate'));

CREATE INDEX IF NOT EXISTS webauthn_challenge_user_kind_expires_idx
  ON webauthn_challenge (user_id, kind, expires_at DESC);

COMMIT;
