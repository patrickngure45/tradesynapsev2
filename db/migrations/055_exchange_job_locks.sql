-- Distributed job locks (TTL-based)
-- Prevents overlapping cron/worker runs across multiple replicas.

CREATE TABLE IF NOT EXISTS ex_job_lock (
  key text PRIMARY KEY,
  holder_id text NOT NULL,
  held_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ex_job_lock_held_until_idx ON ex_job_lock (held_until);
