BEGIN;

-- Lightweight service heartbeat table.
-- Used by background workers (outbox-worker, deposit-scan, sweepers) so the admin
-- dashboard can determine whether the system is healthy / degraded / offline.

CREATE TABLE IF NOT EXISTS app_service_heartbeat (
  service text PRIMARY KEY,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'degraded', 'error')),
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_service_heartbeat_last_seen_idx
  ON app_service_heartbeat(last_seen_at DESC);

COMMIT;
