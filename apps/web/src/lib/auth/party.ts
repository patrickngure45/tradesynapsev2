import { getSessionTokenFromRequest, verifySessionToken } from "@/lib/auth/session";

const isProd = process.env.NODE_ENV === "production";
const enforceAuth = isProd || process.env.ENFORCE_AUTH === "1";

/**
 * Resolve the acting user identity from the request.
 *
 * In production (or when ENFORCE_AUTH=1), **only** the signed session cookie
 * or a valid internal service token is trusted.
 * In development, the `x-user-id` header is also accepted
 * (convenience for scripts/smoke tests).
 */
export function getActingUserId(request: Request): string | null {
  // 1. Try signed session cookie first (always trusted).
  const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
  if (secret) {
    const token = getSessionTokenFromRequest(request);
    if (token) {
      const verified = verifySessionToken({ token, secret });
      if (verified.ok) return verified.payload.uid;
    }
  } else if (enforceAuth) {
    // In production, refuse to operate without a session secret.
    // This prevents silent auth bypass if the env var is unset.
    console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!");
    return null;
  }

  // 2. Internal service-to-service calls (e.g. copy trading placing orders
  //    on behalf of subscribers). Trusted in ALL environments when the
  //    shared secret matches.
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (internalSecret) {
    const headerSecret = request.headers.get("x-internal-service-token");
    if (headerSecret && headerSecret === internalSecret) {
      const uid = request.headers.get("x-user-id");
      if (uid) return uid;
    }
  }

  // 3. In dev only (without ENFORCE_AUTH), fall back to the x-user-id header.
  if (!enforceAuth) {
    const header = request.headers.get("x-user-id");
    if (header) return header;
  }

  return null;
}

export function requireActingUserIdInProd(actingUserId: string | null): string | null {
  if (enforceAuth && !actingUserId) {
    return "missing_x_user_id";
  }
  return null;
}

export function isParty(actingUserId: string | null, trade: { buyer_user_id: string; seller_user_id: string }): boolean {
  if (!actingUserId) return false;
  return actingUserId === trade.buyer_user_id || actingUserId === trade.seller_user_id;
}
