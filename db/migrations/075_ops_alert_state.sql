-- Ops alert state (dedupe / anti-spam)
-- Used by /api/cron/ops-alerts to avoid sending the same alert repeatedly.

CREATE TABLE IF NOT EXISTS app_ops_alert_state (
  key text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT to_timestamp(0),
  last_fingerprint text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_ops_alert_state_last_sent_at
  ON app_ops_alert_state (last_sent_at DESC);
