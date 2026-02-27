-- 013_audit_log.sql
-- Immutable audit log for security-critical operations.
--
-- This table is append-only. No UPDATE or DELETE triggers are defined;
-- instead, a trigger prevents modifications after insert.

CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial       PRIMARY KEY,
  ts            timestamptz     NOT NULL DEFAULT now(),
  -- Who performed the action.
  actor_id      uuid,                             -- app_user.id (null for system actions)
  actor_type    text            NOT NULL DEFAULT 'user',  -- 'user', 'admin', 'system', 'outbox'
  -- What happened.
  action        text            NOT NULL,         -- e.g. 'auth.session.created', 'withdrawal.approved'
  -- What it targeted.
  resource_type text,                             -- e.g. 'withdrawal', 'order', 'trade', 'user'
  resource_id   text,                             -- primary key of the target
  -- Context.
  ip            inet,
  user_agent    text,
  request_id    text,
  -- Arbitrary structured payload (details, diff, risk scores, etc.)
  detail        jsonb           NOT NULL DEFAULT '{}'::jsonb,
  -- Ensure chronological ordering is queryable.
  CONSTRAINT audit_log_action_not_empty CHECK (char_length(action) > 0)
);

-- Index for querying by actor.
CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log (actor_id, ts DESC);
-- Index for querying by action type.
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON audit_log (action, ts DESC);
-- Index for querying by resource.
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource_type, resource_id, ts DESC);

-- Prevent UPDATE and DELETE on audit_log rows (append-only).
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are immutable — UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON audit_log;
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON audit_log;
CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
