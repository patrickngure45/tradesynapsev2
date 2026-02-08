/**
 * Structured request logger.
 *
 * Emits one JSON line per request with:
 *   requestId, method, path, status, durationMs, ip, userAgent, userId
 *
 * In dev the output is also human-readable via a compact format.
 * In production, downstream log collectors (CloudWatch, Datadog, etc.)
 * can index the JSON fields directly.
 */

export type RequestLogEntry = {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
  userId: string | null;
  /** Extra context (error code, rate-limit info, etc.). */
  meta?: Record<string, unknown>;
  ts: string;
};

/**
 * Generate a request ID (compact UUID v4 without dashes).
 * If the incoming request already carries `x-request-id`, reuse it
 * (common when behind a reverse proxy / CDN).
 */
export function getOrCreateRequestId(request: Request): string {
  const existing = request.headers.get("x-request-id");
  if (existing && existing.length >= 8 && existing.length <= 128) return existing;
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Extract the client IP from standard proxy headers.
 * Next.js on Vercel provides `x-forwarded-for`; adjust for your infra.
 */
export function extractClientIp(request: Request): string | null {
  // x-real-ip is set by many reverse proxies (nginx, Caddy, ALB).
  const real = request.headers.get("x-real-ip");
  if (real) return real.split(",")[0]!.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return null;
}

const isProd = process.env.NODE_ENV === "production";

export function logRequest(entry: RequestLogEntry): void {
  if (isProd) {
    // Machine-readable JSON line for log aggregators.
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    // Compact human-readable format for dev.
    const uid = entry.userId ? ` u=${entry.userId.slice(0, 8)}` : "";
    const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : "";
    console.log(
      `[${entry.requestId.slice(0, 8)}] ${entry.method} ${entry.path} → ${entry.status} (${entry.durationMs}ms)${uid}${meta}`
    );
  }
}
