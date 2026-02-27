/**
 * Timing-safe secret comparison utilities.
 *
 * All secret comparisons (reviewer key, bootstrap key, admin key) MUST use
 * `safeCompare` to prevent timing side-channel attacks.
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison.
 * Returns `true` if `a === b` without leaking length or content via timing.
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  // timingSafeEqual requires equal-length buffers.
  // To avoid leaking the length of the expected value we hash both first,
  // but for simplicity (and because these are short config keys, not
  // passwords) we pad the shorter one and compare, then length-check.
  if (bufA.length !== bufB.length) {
    // Still run the comparison to avoid short-circuiting timing leaks.
    const dummy = Buffer.alloc(bufA.length, 0);
    timingSafeEqual(bufA, dummy);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

// ── Reusable key-gating helpers ───────────────────────────────────────

export type KeyCheckResult = { ok: true } | { ok: false; error: string };

/**
 * Require that a header-provided key matches a configured env key.
 *
 * @param opts.envKey  The expected key value from env.
 * @param opts.headerValue  The value the client sent.
 * @param opts.notConfiguredError  Error code when env key is missing in prod.
 * @param opts.invalidError  Error code when the header doesn't match.
 */
export function requireKey(opts: {
  envKey: string | null | undefined;
  headerValue: string | null | undefined;
  notConfiguredError: string;
  invalidError: string;
}): KeyCheckResult {
  const configured = opts.envKey ?? null;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !configured) {
    return { ok: false, error: opts.notConfiguredError };
  }

  if (configured) {
    const provided = opts.headerValue ?? "";
    if (!provided || !safeCompare(provided, configured)) {
      return { ok: false, error: opts.invalidError };
    }
  }

  return { ok: true };
}

// ── Convenience wrappers for each role ────────────────────────────────

export function requireReviewerKey(request: Request): KeyCheckResult {
  return requireKey({
    envKey: process.env.PROOFPACK_REVIEWER_KEY,
    headerValue: request.headers.get("x-reviewer-key"),
    notConfiguredError: "reviewer_key_not_configured",
    invalidError: "reviewer_key_invalid",
  });
}

export function requireAdminKey(request: Request): KeyCheckResult {
  return requireKey({
    envKey: process.env.EXCHANGE_ADMIN_KEY,
    headerValue: request.headers.get("x-admin-key"),
    notConfiguredError: "admin_key_not_configured",
    invalidError: "admin_key_invalid",
  });
}

export function requireBootstrapKeyIfProd(request: Request): string | null {
  if (process.env.NODE_ENV !== "production") return null;

  const result = requireKey({
    envKey: process.env.PROOFPACK_SESSION_BOOTSTRAP_KEY,
    headerValue: request.headers.get("x-session-bootstrap-key"),
    notConfiguredError: "session_bootstrap_not_configured",
    invalidError: "session_bootstrap_key_invalid",
  });

  return result.ok ? null : result.error;
}
