-- Persistence for rate-limit buckets.
-- Allows rate-limit state to survive restarts and be shared across instances.

CREATE TABLE IF NOT EXISTS rate_limit_bucket (
  name        text     NOT NULL,           -- limiter name: 'api', 'auth', 'exchange-write'
  key         text     NOT NULL,           -- client identifier (typically IP)
  tokens      integer  NOT NULL DEFAULT 0, -- remaining tokens in window
  window_ms   integer  NOT NULL,           -- window duration in ms
  max_tokens  integer  NOT NULL,           -- max tokens per window
  window_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (name, key)
);

-- Index for periodic cleanup of expired buckets
CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_expiry
  ON rate_limit_bucket (window_start);

-- Cleanup function: remove buckets whose window has expired
-- Called periodically from the application or a cron job
CREATE OR REPLACE FUNCTION clean_expired_rate_limit_buckets()
RETURNS integer AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM rate_limit_bucket
  WHERE window_start + make_interval(secs => window_ms / 1000.0) < now();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql;
