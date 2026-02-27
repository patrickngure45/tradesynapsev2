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

function looksSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("password") ||
    k.includes("secret") ||
    k.includes("token") ||
    k.includes("apikey") ||
    k.includes("api_key") ||
    k.includes("private") ||
    k.includes("seed") ||
    k.includes("jwt") ||
    k.includes("authorization") ||
    k.includes("cookie")
  );
}

function envSecrets(): string[] {
  const names = [
    "SECRET_KEY",
    "PROOFPACK_SESSION_SECRET",
    "PROOFPACK_SESSION_BOOTSTRAP_KEY",
    "PROOFPACK_REVIEWER_KEY",
    "EXCHANGE_ADMIN_KEY",
    "EXCHANGE_CRON_SECRET",
    "CRON_SECRET",
    "RESET_SECRET",
    "ADMIN_RESET_SECRET",
    "INTERNAL_SERVICE_SECRET",
    "DEPLOYER_PRIVATE_KEY",
    "CITADEL_MASTER_SEED",
    "GROQ_API_KEY",
    "GOOGLE_API_KEY",
    "PINATA_JWT",
    "BINANCE_API_KEY",
    "BINANCE_API_SECRET",
  ];

  const out: string[] = [];
  for (const n of names) {
    const v = String(process.env[n] ?? "").trim();
    if (v && v.length >= 8) out.push(v);
  }
  return out;
}

const SECRET_VALUES = envSecrets();

function redactString(s: string): string {
  let out = s;
  for (const secret of SECRET_VALUES) {
    if (!secret) continue;
    if (out.includes(secret)) out = out.split(secret).join("[REDACTED]");
  }
  return out;
}

function redactUnknown(v: unknown, depth: number): unknown {
  if (depth > 6) return "[TRUNCATED]";

  if (v == null) return v;
  if (typeof v === "string") return redactString(v);
  if (typeof v === "number" || typeof v === "boolean") return v;

  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redactUnknown(x, depth + 1));

  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, val] of Object.entries(obj)) {
      count += 1;
      if (count > 80) {
        out.__more__ = "[TRUNCATED]";
        break;
      }
      if (looksSecretKey(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactUnknown(val, depth + 1);
      }
    }
    return out;
  }

  return String(v);
}

function redactEntry(entry: RequestLogEntry): RequestLogEntry {
  return {
    ...entry,
    userAgent: entry.userAgent ? redactString(entry.userAgent) : entry.userAgent,
    meta: entry.meta ? (redactUnknown(entry.meta, 0) as Record<string, unknown>) : entry.meta,
  };
}

export function logRequest(entry: RequestLogEntry): void {
  const safe = redactEntry(entry);
  if (isProd) {
    // Machine-readable JSON line for log aggregators.
    process.stdout.write(JSON.stringify(safe) + "\n");
  } else {
    // Compact human-readable format for dev.
    const uid = safe.userId ? ` u=${safe.userId.slice(0, 8)}` : "";
    const meta = safe.meta ? ` ${JSON.stringify(safe.meta)}` : "";
    console.log(
      `[${safe.requestId.slice(0, 8)}] ${safe.method} ${safe.path} → ${safe.status} (${safe.durationMs}ms)${uid}${meta}`
    );
  }
}
