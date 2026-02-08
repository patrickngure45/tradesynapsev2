/**
 * Next.js Proxy (formerly "middleware")
 *
 * Runs on **every matched request** before route handlers.
 * Responsibilities:
 *   1. Attach a request ID (`x-request-id`) to every response.
 *   2. Apply rate limiting (IP-based, tiered by route class).
 *   3. Log each request with structured fields.
 *   4. Inject security headers on all responses.
 *   5. Redirect HTTP → HTTPS in production.
 *   6. Double-submit CSRF cookie on mutations.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  apiLimiter,
  authLimiter,
  exchangeWriteLimiter,
  type RateLimitResult,
} from "@/lib/rateLimit";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";
import {
  getOrCreateRequestId,
  extractClientIp,
  logRequest,
  type RequestLogEntry,
} from "@/lib/requestLog";
import {
  getSessionCookieName,
  verifySessionToken,
} from "@/lib/auth/session";

const isProd = process.env.NODE_ENV === "production";

export const config = {
  /*
   * Match all API routes and page routes
   * but skip Next.js internals and static files.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

// ── Security headers applied to every response ────────────────────────
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "off",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' wss: ws:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ") + ";",
  "Cross-Origin-Opener-Policy": "same-origin",
};

// ── CSRF double-submit cookie name ────────────────────────────────────
const CSRF_COOKIE = "__csrf";
const CSRF_HEADER = "x-csrf-token";

function getPublicOriginFromForwardedHeaders(request: NextRequest): string | null {
  const xfProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const xfHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!xfProto || !xfHost) return null;

  // Basic sanity: host header should not contain spaces
  if (/\s/.test(xfHost)) return null;
  return `${xfProto}://${xfHost}`;
}

function attachCsrfCookieIfMissing(request: NextRequest, response: NextResponse) {
  if (request.cookies.get(CSRF_COOKIE)?.value) return response;

  const csrfToken = crypto.randomUUID().replace(/-/g, "");
  const parts = [
    `${CSRF_COOKIE}=${csrfToken}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 365}`,
  ];
  if (isProd) parts.push("Secure");
  response.headers.append("Set-Cookie", parts.join("; "));
  response.headers.set("x-csrf-cookie", "set");
  return response;
}

// ── Route classification for tiered rate limiting ─────────────────────

function classifyRoute(pathname: string, method: string): "auth" | "exchange-write" | "api" | "page" {
  if (pathname.startsWith("/api/auth")) return "auth";

  if (
    pathname.startsWith("/api/exchange/orders") ||
    pathname.startsWith("/api/exchange/withdrawals")
  ) {
    if (method === "POST" || method === "DELETE") return "exchange-write";
  }

  if (pathname.startsWith("/api/")) return "api";

  return "page";
}

// ── Persistent (PostgreSQL-backed) rate limiters ───────────────────────
// Lazy-initialised on first use when DATABASE_URL is available.
// Falls back to in-memory limiters when the DB is unavailable.

let pgLimiters: {
  auth: PgRateLimiter;
  exchangeWrite: PgRateLimiter;
  api: PgRateLimiter;
} | null = null;
let pgInitFailed = false;

function getPgLimiters() {
  if (pgLimiters || pgInitFailed) return pgLimiters;
  try {
    // Dynamic require to avoid breaking middleware if DB is unavailable
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSql } = require("@/lib/db") as { getSql: () => import("postgres").Sql };
    const sql = getSql();
    pgLimiters = {
      api: createPgRateLimiter(sql, { name: "api", windowMs: 60_000, max: 120 }),
      auth: createPgRateLimiter(sql, { name: "auth", windowMs: 60_000, max: 20 }),
      exchangeWrite: createPgRateLimiter(sql, { name: "exchange-write", windowMs: 60_000, max: 40 }),
    };
    return pgLimiters;
  } catch {
    pgInitFailed = true;
    return null;
  }
}

// ── Rate limit check ─────────────────────────────────────────────────

async function checkRateLimit(
  routeClass: ReturnType<typeof classifyRoute>,
  clientIp: string
): Promise<RateLimitResult | null> {
  // Don't rate-limit plain page navigations.
  if (routeClass === "page") return null;

  // Try persistent (PG) limiters first; fall back to in-memory.
  const pg = getPgLimiters();

  if (pg) {
    try {
      switch (routeClass) {
        case "auth":
          return await pg.auth.consume(clientIp);
        case "exchange-write":
          return await pg.exchangeWrite.consume(clientIp);
        default:
          return await pg.api.consume(clientIp);
      }
    } catch {
      // DB unavailable — fall through to in-memory
    }
  }

  // In-memory fallback (always available)
  switch (routeClass) {
    case "auth":
      return authLimiter.consume(clientIp);
    case "exchange-write":
      return exchangeWriteLimiter.consume(clientIp);
    default:
      return apiLimiter.consume(clientIp);
  }
}

// ── Proxy handler ─────────────────────────────────────────────────

// Protected page prefixes — require valid session cookie
const PROTECTED_PREFIXES = [
  "/portfolio", "/order-history", "/account", "/admin",
  "/arbitrage", "/copy-trading", "/wallet", "/connections",
  "/exchange", "/trades", "/ai", "/notifications",
];

// HTTP methods that need CSRF origin check
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default async function proxy(request: NextRequest) {
  const startMs = Date.now();
  const requestId = getOrCreateRequestId(request);
  const clientIp = extractClientIp(request) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { pathname } = request.nextUrl;
  const method = request.method;

  // ── HTTPS redirect in production ──────────────────────────────────
  if (isProd && request.headers.get("x-forwarded-proto") === "http") {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = "https:";
    return NextResponse.redirect(httpsUrl.toString(), 301);
  }

  // ── CSRF checks on mutating API requests ──────────────────────────
  if (pathname.startsWith("/api/") && MUTATING_METHODS.has(method)) {
    // 1. Origin / Referer check
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    
    // Resolve allowed origins - including CORS list from env
    const normalize = (u: string) => u?.trim().replace(/\/$/, "").toLowerCase();
    
    // Always allow the current request origin (as seen by Next) and the
    // public origin (as seen by the reverse proxy) to avoid mismatches.
    const allowedOrigins = [request.nextUrl.origin];
    const publicOrigin = getPublicOriginFromForwardedHeaders(request);
    if (publicOrigin) allowedOrigins.push(publicOrigin);
    if (process.env.ALLOWED_ORIGIN) allowedOrigins.push(process.env.ALLOWED_ORIGIN);
    
    if (process.env.BACKEND_CORS_ORIGINS) {
      try {
        const raw = process.env.BACKEND_CORS_ORIGINS;
        let parsed;
        try { parsed = JSON.parse(raw); } catch { /* fail safe */ }
        
        if (Array.isArray(parsed)) {
          allowedOrigins.push(...parsed);
        } else if (typeof raw === "string") {
           // Fallback for user entering a raw URL or comma-separated list
           raw.split(",").forEach(s => allowedOrigins.push(s));
        }
      } catch { /* ignore */ }
    }
    
    const allowedSet = new Set(allowedOrigins.filter(Boolean).map(normalize));
    const isAllowed = (url: string) => allowedSet.has(normalize(url));

    if (origin) {
      if (!isAllowed(origin)) {
        console.error(`[CSRF] Blocked Origin: '${origin}'. Allowed:`, [...allowedSet]);
        const res = NextResponse.json(
          {
            error: "csrf_origin_mismatch",
            details: {
              blockedOrigin: origin,
              requestOrigin: request.nextUrl.origin,
              allowedOrigins: [...allowedSet],
            },
          },
          {
            status: 403,
            headers: {
              "x-request-id": requestId,
              "x-blocked-origin": origin,
              ...SECURITY_HEADERS,
            },
          },
        );
        return attachCsrfCookieIfMissing(request, res);
      }
    } else if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (!isAllowed(refOrigin)) {
          const res = NextResponse.json(
            {
              error: "csrf_referer_mismatch",
              details: {
                blockedRefererOrigin: refOrigin,
                referer,
                requestOrigin: request.nextUrl.origin,
                allowedOrigins: [...allowedSet],
              },
            },
            { status: 403, headers: { "x-request-id": requestId, ...SECURITY_HEADERS } },
          );
          return attachCsrfCookieIfMissing(request, res);
        }
      } catch {
        const res = NextResponse.json(
          { error: "csrf_invalid_referer", details: { referer } },
          { status: 403, headers: { "x-request-id": requestId, ...SECURITY_HEADERS } },
        );
        return attachCsrfCookieIfMissing(request, res);
      }
    } else {
      const res = NextResponse.json(
        {
          error: "csrf_no_origin",
          details: {
            requestOrigin: request.nextUrl.origin,
            allowedOrigins: [...allowedSet],
          },
        },
        { status: 403, headers: { "x-request-id": requestId, ...SECURITY_HEADERS } },
      );
      return attachCsrfCookieIfMissing(request, res);
    }

    // 2. Double-submit CSRF token check (cookie must match header)
    // Auth bootstrap endpoints can be called before the browser has a CSRF cookie.
    // Keep the Origin/Referer check above, but do not require the token for these.
    const isAuthBootstrap = pathname === "/api/auth/login" || pathname === "/api/auth/signup";
    const csrfCookie = request.cookies.get(CSRF_COOKIE)?.value;
    const csrfHeader = request.headers.get(CSRF_HEADER);
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      // In dev, skip if client hasn't adopted CSRF tokens yet
      if (isProd) {
        if (isAuthBootstrap) return;
        const res = NextResponse.json(
          {
            error: "csrf_token_mismatch",
            details: {
              hasCookie: Boolean(csrfCookie),
              hasHeader: Boolean(csrfHeader),
              cookieName: CSRF_COOKIE,
              headerName: CSRF_HEADER,
              origin,
              referer,
              requestOrigin: request.nextUrl.origin,
            },
          },
          { status: 403, headers: { "x-request-id": requestId, ...SECURITY_HEADERS } },
        );
        return attachCsrfCookieIfMissing(request, res);
      }
    }
  }

  // ── Auto-login for Development (if no session exists) ────────────────
  // In dev, we can inject a user ID to bypass auth if no cookie is present.
  let devHeaders: Headers | undefined;
  if (!isProd && !request.cookies.get(getSessionCookieName())) {
     const DEV_USER_ID = "4760aacb-013c-492f-aaae-e115786ab271"; // Seeded user
     devHeaders = new Headers(request.headers);
     devHeaders.set("x-user-id", DEV_USER_ID);
  }

  // ── Auth guard on protected pages ─────────────────────────────────
  const isProtectedPage = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isProtectedPage) {
    const cookieName = getSessionCookieName();
    const token = request.cookies.get(cookieName)?.value;
    const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";

    let authenticated = false;
    if (token && secret) {
      const result = verifySessionToken({ token, secret });
      authenticated = result.ok;
    }

    if (!authenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const routeClass = classifyRoute(pathname, method);
  const rl = await checkRateLimit(routeClass, clientIp);

  // ── Rate-limit exceeded → 429 ──────────────────────────────────────
  if (rl && !rl.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetMs - Date.now()) / 1000));

    const body = JSON.stringify({
      error: "rate_limit_exceeded",
      details: { retry_after_seconds: retryAfterSec },
    });

    const res = new NextResponse(body, {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rl.resetMs / 1000)),
        "x-request-id": requestId,
        ...SECURITY_HEADERS,
      },
    });

    logRequest({
      requestId,
      method,
      path: pathname,
      status: 429,
      durationMs: Date.now() - startMs,
      ip: clientIp,
      userAgent: request.headers.get("user-agent"),
      userId: null,
      meta: { rateLimited: true, retryAfterSec },
      ts: new Date().toISOString(),
    });

    return res;
  }

  // ── Continue to the actual handler ─────────────────────────────────
  const response = NextResponse.next({
    request: {
      headers: devHeaders ?? new Headers(request.headers),
    },
  });

  // Attach request ID so route handlers can read it and it appears in
  // the response.
  response.headers.set("x-request-id", requestId);

  // Inject security headers.
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // ── Ensure CSRF double-submit cookie is present ─────────────────────
  attachCsrfCookieIfMissing(request, response);

  // Rate-limit headers (informational).
  if (rl) {
    response.headers.set("X-RateLimit-Limit", String(rl.limit));
    response.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    response.headers.set("X-RateLimit-Reset", String(Math.ceil(rl.resetMs / 1000)));
  }

  // ── Log the request (we don't have the final status here, so we log
  //    the "request received" event; route handlers log errors inline). ─
  logRequest({
    requestId,
    method,
    path: pathname,
    status: 0, // 0 = not yet known (middleware only sees the request phase)
    durationMs: Date.now() - startMs,
    ip: clientIp,
    userAgent: request.headers.get("user-agent"),
    userId: null, // will be resolved inside route handlers
    ts: new Date().toISOString(),
  });

  return response;
}
