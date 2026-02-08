/**
 * Route-level response logging helper.
 *
 * The middleware logs at request-entry time (before the route runs) so it
 * doesn't know the final HTTP status or the authenticated user ID.
 *
 * This helper lets route handlers emit a completion-phase log line with
 * the actual status, user, and any route-specific metadata.
 *
 * Usage in a route:
 *
 *   import { logRouteResponse } from "@/lib/routeLog";
 *
 *   export async function POST(request: Request) {
 *     const start = Date.now();
 *     // … handler logic …
 *     const response = Response.json(body, { status: 201 });
 *     logRouteResponse(request, response, { startMs: start, userId: actingUserId });
 *     return response;
 *   }
 */

import { logRequest, type RequestLogEntry } from "@/lib/requestLog";

export type RouteLogOpts = {
  /** Epoch-ms when the route handler started (use Date.now() at the top). */
  startMs: number;
  /** Authenticated user ID (if known). */
  userId?: string | null;
  /** Arbitrary extra context (error code, etc.). */
  meta?: Record<string, unknown>;
};

/**
 * Emit a structured log line for a completed route response.
 * Reads `x-request-id` from the incoming request (set by middleware).
 */
export function logRouteResponse(
  request: Request,
  response: Response,
  opts: RouteLogOpts
): void {
  const requestId = request.headers.get("x-request-id") ?? "unknown";
  const url = new URL(request.url, "http://localhost");

  const entry: RequestLogEntry = {
    requestId,
    method: request.method,
    path: url.pathname,
    status: response.status,
    durationMs: Date.now() - opts.startMs,
    ip: request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
    userId: opts.userId ?? null,
    meta: opts.meta,
    ts: new Date().toISOString(),
  };

  logRequest(entry);
}
