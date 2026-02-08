/**
 * PostgreSQL-backed rate limiter.
 *
 * Same logical interface as the in-memory `createRateLimiter` but persists
 * state in the `rate_limit_bucket` table — surviving restarts and working
 * across multiple server instances.
 *
 * The entire consume operation is a single atomic UPSERT, so it is safe
 * under concurrent access without application-level locking.
 */

import type { Sql } from "postgres";
import type { RateLimitResult } from "./rateLimit";

export type PgRateLimiterOpts = {
  /** Limiter name — used as the first part of the composite PK ('api', 'auth', etc.). */
  name: string;
  /** Window length in milliseconds (default 60 000 = 1 min). */
  windowMs?: number;
  /** Maximum requests per window (default 60). */
  max?: number;
};

export type PgRateLimiter = {
  consume: (key: string) => Promise<RateLimitResult>;
  name: string;
};

export function createPgRateLimiter(
  sql: Sql,
  opts: PgRateLimiterOpts,
): PgRateLimiter {
  const { name } = opts;
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 60;

  /**
   * Atomically consume one token for `key`.
   *
   * Uses an UPSERT so that:
   *   - New keys are inserted with `max - 1` tokens (one already consumed).
   *   - Existing keys within their window are decremented.
   *   - Expired windows are reset to `max - 1`.
   *
   * A token count of -1 means the bucket is exhausted.
   */
  async function consume(key: string): Promise<RateLimitResult> {
    const rows = await sql<
      { tokens: number; window_start_ms: number }[]
    >`
      INSERT INTO rate_limit_bucket (name, key, tokens, window_ms, max_tokens, window_start)
      VALUES (${name}, ${key}, ${max - 1}, ${windowMs}, ${max}, now())
      ON CONFLICT (name, key)
      DO UPDATE SET
        tokens = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN ${max - 1}
          ELSE GREATEST(rate_limit_bucket.tokens - 1, -1)
        END,
        window_start = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN now()
          ELSE rate_limit_bucket.window_start
        END,
        window_ms   = ${windowMs},
        max_tokens  = ${max}
      RETURNING
        tokens,
        (extract(epoch FROM window_start) * 1000)::bigint AS window_start_ms
    `;

    const row = rows[0]!;
    const resetMs = Number(row.window_start_ms) + windowMs;
    const remaining = Math.max(0, row.tokens);
    const allowed = row.tokens >= 0;

    return { allowed, remaining, resetMs, limit: max };
  }

  return { consume, name };
}
