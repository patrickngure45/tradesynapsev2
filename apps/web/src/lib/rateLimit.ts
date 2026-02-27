/**
 * In-memory sliding-window rate limiter (per-key token bucket).
 *
 * This is suitable for a **single-process** deployment (Next.js dev or
 * single-instance prod).  For multi-instance prod, swap the backing store
 * to Redis (same interface).
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });
 *   const result  = limiter.consume(clientKey);
 *   if (!result.allowed) { /* 429 * / }
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Remaining tokens in the current window. */
  remaining: number;
  /** Epoch-ms when the window resets. */
  resetMs: number;
  /** Total tokens per window (for headers). */
  limit: number;
};

type Bucket = {
  tokens: number;
  windowStart: number;
};

export type RateLimiterOpts = {
  /** Window length in milliseconds (default 60 000 = 1 min). */
  windowMs?: number;
  /** Maximum requests per window (default 60). */
  max?: number;
  /** Evict stale buckets every N ms (default 120 000 = 2 min). */
  sweepIntervalMs?: number;
};

export type RateLimiter = {
  consume: (key: string) => RateLimitResult;
  /** Visible for testing / monitoring. */
  size: () => number;
};

export function createRateLimiter(opts?: RateLimiterOpts): RateLimiter {
  const windowMs = opts?.windowMs ?? 60_000;
  const max = opts?.max ?? 60;
  const sweepInterval = opts?.sweepIntervalMs ?? 120_000;

  const buckets = new Map<string, Bucket>();

  // Periodic sweep of expired buckets to avoid unbounded growth.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= windowMs) {
        buckets.delete(key);
      }
    }
  }, sweepInterval);
  // Let the process exit without waiting for the timer.
  if (timer && typeof timer === "object" && "unref" in timer) {
    (timer as NodeJS.Timeout).unref();
  }

  function consume(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = { tokens: max, windowStart: now };
      buckets.set(key, bucket);
    }

    const resetMs = bucket.windowStart + windowMs;

    if (bucket.tokens <= 0) {
      return { allowed: false, remaining: 0, resetMs, limit: max };
    }

    bucket.tokens -= 1;
    return { allowed: true, remaining: bucket.tokens, resetMs, limit: max };
  }

  return {
    consume,
    size: () => buckets.size,
  };
}

// ── Pre-configured singleton limiters ──────────────────────────────────

/** General API: 120 req / min per IP. */
export const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

/** Auth endpoints: 20 req / min per IP (brute-force mitigation). */
export const authLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

/** General mutating API endpoints (POST/PUT/PATCH/DELETE): 80 req / min per IP. */
export const apiWriteLimiter = createRateLimiter({ windowMs: 60_000, max: 80 });

/** Exchange write endpoints (orders, withdrawals): 40 req / min per IP. */
export const exchangeWriteLimiter = createRateLimiter({ windowMs: 60_000, max: 40 });
