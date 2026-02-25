import { apiError } from "@/lib/api/errors";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";

const limiterCache = new Map<string, PgRateLimiter>();

type SqlLike = Parameters<typeof createPgRateLimiter>[0];

function getLimiter(sql: SqlLike, name: string, windowMs: number, max: number): PgRateLimiter {
  const key = `${name}:${windowMs}:${max}`;
  const existing = limiterCache.get(key);
  if (existing) return existing;
  const limiter = createPgRateLimiter(sql, { name, windowMs, max });
  limiterCache.set(key, limiter);
  return limiter;
}

function extractIp(request: Request): string | null {
  const real = request.headers.get("x-real-ip");
  if (real) return real.split(",")[0]?.trim() ?? null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return null;
}

export async function enforceAccountSecurityRateLimit(opts: {
  sql: SqlLike;
  request: Request;
  limiterName: string;
  windowMs: number;
  max: number;
  userId?: string | null;
  includeIp?: boolean;
}): Promise<Response | null> {
  const limiter = getLimiter(opts.sql, opts.limiterName, opts.windowMs, opts.max);
  const checks: Array<Promise<{ ok: boolean; scope: "user" | "ip" }>> = [];

  if (opts.userId) {
    checks.push(limiter.consume(`u:${opts.userId}`).then((r) => ({ ok: r.allowed, scope: "user" as const })));
  }

  if (opts.includeIp !== false) {
    const ip = extractIp(opts.request);
    if (ip) {
      checks.push(limiter.consume(`ip:${ip}`).then((r) => ({ ok: r.allowed, scope: "ip" as const })));
    }
  }

  if (!checks.length) return null;
  const results = await Promise.all(checks);
  const denied = results.find((r) => !r.ok);
  if (!denied) return null;

  return apiError("rate_limit_exceeded", {
    status: 429,
    details: {
      limiter: opts.limiterName,
      scope: denied.scope,
    },
  });
}
